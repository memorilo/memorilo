import type { Decoration, DecorationObserver } from '@readium/navigator'
import type { BasicTextSelection } from '@readium/navigator-html-injectables'
import type {
  ReaderAnnotation,
  ReaderAnnotationColor,
  ReaderEpubLocator,
  ReaderPresentationMode,
  ReaderTextQuote,
} from '../../types'
import type { ReaderAdapter, ReaderAdapterCallbacks, ReaderAdapterState } from '../reader-adapter'
import type { EpubLayoutKind, ParsedEpub } from './epub-parser'
import { DecorationStyleType, EpubNavigator, EpubPreferences } from '@readium/navigator'
import { Locator } from '@readium/shared'
import { parseEpub } from './epub-parser'

interface EpubSource {
  bytes: Uint8Array
  name: string
}

const minimumScale = 0.75
const maximumScale = 2
const annotationGroup = 'memorilo-annotations'

const annotationTints: Record<ReaderAnnotationColor, string> = {
  blue: '#77B7FF',
  green: '#75D49B',
  pink: '#FF8DB3',
  purple: '#B99BFF',
  yellow: '#FFD84D',
}

function clampScale(value: number) {
  return Math.min(maximumScale, Math.max(minimumScale, Math.round(value * 10) / 10))
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function presentationReason(layout: EpubLayoutKind): string | undefined {
  if (layout === 'fixed')
    return 'This fixed-layout EPUB preserves its publisher-designed pages'
  if (layout === 'mixed')
    return 'This EPUB mixes fixed and reflowable sections, so publisher layout is preserved throughout'
  return undefined
}

function preferences(mode: ReaderPresentationMode, scale: number) {
  if (mode === 'reader') {
    return new EpubPreferences({
      fontSize: scale,
      fontSizeNormalize: true,
      lineHeight: 1.5,
      optimalLineLength: 65,
      paragraphSpacing: 1,
      textNormalization: true,
    })
  }
  return new EpubPreferences({
    fontSize: null,
    fontSizeNormalize: null,
    lineHeight: null,
    optimalLineLength: null,
    paragraphSpacing: null,
    textNormalization: null,
  })
}

function readerLocator(locator: Locator, quote: ReaderTextQuote): ReaderEpubLocator {
  const serialized = locator.serialize() as ReaderEpubLocator
  if (!serialized.href || !serialized.type)
    throw new Error('Readium returned an invalid selection locator')
  return {
    ...serialized,
    text: {
      ...serialized.text,
      after: quote.after,
      before: quote.before,
      highlight: quote.exact,
    },
  }
}

function selectionFrame(container: HTMLElement, targetFrameSrc: string): HTMLIFrameElement | null {
  const frames = [...container.querySelectorAll('iframe')]
  return frames.find((frame) => {
    if (frame.src === targetFrameSrc)
      return true
    try {
      return frame.contentWindow?.location.href === targetFrameSrc
    }
    catch {
      return false
    }
  }) ?? frames[0] ?? null
}

function selectionQuote(frame: HTMLIFrameElement | null, exact: string): ReaderTextQuote {
  if (!frame)
    return { exact }
  const selection = frame?.contentWindow?.getSelection()
  if (!selection || selection.rangeCount === 0)
    return { exact }

  const range = selection.getRangeAt(0)
  const document = frame.contentDocument
  if (!document?.body)
    return { exact }
  const anchoredExact = range.toString()
  if (!anchoredExact)
    throw new Error('EPUB selection range does not contain text')

  const beforeRange = document.createRange()
  beforeRange.selectNodeContents(document.body)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  const afterRange = document.createRange()
  afterRange.selectNodeContents(document.body)
  afterRange.setStart(range.endContainer, range.endOffset)
  return {
    after: afterRange.toString().slice(0, 64),
    before: beforeRange.toString().slice(-64),
    exact: anchoredExact,
  }
}

function readiumDecoration(annotation: ReaderAnnotation): Decoration | null {
  if (annotation.anchor.format !== 'epub')
    return null
  const locator = Locator.deserialize(annotation.anchor.locator)
  if (!locator)
    throw new Error(`Annotation ${annotation.id} contains an invalid EPUB locator`)
  return {
    id: annotation.id,
    locator,
    style: {
      tint: annotationTints[annotation.color],
      type: annotation.kind === 'annotation'
        ? DecorationStyleType.HighlightUnderline
        : DecorationStyleType.Highlight,
    },
  }
}

class EpubAdapter implements ReaderAdapter {
  private annotations: readonly ReaderAnnotation[] = []
  private container: HTMLElement | null = null
  private currentLocator: Locator
  private destroyed = false
  private navigator: EpubNavigator | null = null
  private presentationMode: ReaderPresentationMode
  private scale = 1

  private readonly decorationObserver: DecorationObserver = {
    onDecorationActivated: ({ decoration }) => {
      this.callbacks.onAnnotationActivate({ annotationId: decoration.id })
      return true
    },
  }

  constructor(
    private readonly source: EpubSource,
    private readonly parsed: ParsedEpub,
    initialPresentationMode: ReaderPresentationMode,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {
    this.presentationMode = parsed.layout === 'reflowable' ? initialPresentationMode : 'publisher'
    const initialLocator = parsed.positions[0]
    if (!initialLocator)
      throw new Error('EPUB does not contain a readable spine position')
    this.currentLocator = initialLocator
  }

  async mount(container: HTMLElement) {
    if (this.destroyed)
      throw new Error('Cannot mount a destroyed EPUB reader')
    if (this.container)
      throw new Error('EPUB reader is already mounted')
    this.container = container

    const navigatorContainer = document.createElement('div')
    navigatorContainer.setAttribute('role', 'document')
    navigatorContainer.setAttribute('aria-label', this.parsed.title)
    Object.assign(navigatorContainer.style, {
      background: '#fff',
      height: '100%',
      margin: '0 auto',
      maxWidth: '100%',
      overflow: 'hidden',
      position: 'relative',
      width: '100%',
    })
    container.append(navigatorContainer)

    const navigator = new EpubNavigator(
      navigatorContainer,
      this.parsed.publication,
      {
        click: () => false,
        contentProtection: () => undefined,
        contextMenu: () => undefined,
        customEvent: () => undefined,
        frameLoaded: () => undefined,
        handleLocator: () => true,
        miscPointer: () => undefined,
        peripheral: () => undefined,
        positionChanged: (locator) => {
          this.currentLocator = locator
          this.emitState()
        },
        scroll: () => undefined,
        tap: () => false,
        textSelected: (selection) => {
          try {
            this.handleTextSelection(selection)
          }
          catch (error) {
            this.callbacks.onError(toError(error))
          }
        },
        timelineItemChanged: () => undefined,
        zoom: () => undefined,
      },
      this.parsed.positions,
      this.currentLocator,
      {
        defaults: {},
        injectables: { allowedDomains: [], rules: [] },
        preferences: preferences(this.presentationMode, this.scale),
      },
    )
    this.navigator = navigator
    navigator.registerDecorationObserver(annotationGroup, this.decorationObserver)
    await navigator.load()
    if (this.destroyed)
      return
    this.currentLocator = navigator.currentLocator
    this.applyAnnotations()
    this.emitState()
  }

  clearSelection() {
    for (const frame of this.container?.querySelectorAll('iframe') ?? [])
      frame.contentWindow?.getSelection()?.removeAllRanges()
    this.callbacks.onSelectionChange(null)
  }

  async destroy() {
    if (this.destroyed)
      return
    this.destroyed = true
    const navigator = this.navigator
    this.navigator = null
    if (navigator) {
      navigator.unregisterDecorationObserver(this.decorationObserver)
      await navigator.destroy()
    }
    this.container?.replaceChildren()
    this.container = null
    await this.parsed.archive.close()
  }

  async goBackward() {
    const navigator = this.requireNavigator()
    if (!navigator.canGoBackward)
      return
    await new Promise<void>(resolve => navigator.goBackward(false, () => resolve()))
    this.currentLocator = navigator.currentLocator
    this.emitState()
  }

  async goForward() {
    const navigator = this.requireNavigator()
    if (!navigator.canGoForward)
      return
    await new Promise<void>(resolve => navigator.goForward(false, () => resolve()))
    this.currentLocator = navigator.currentLocator
    this.emitState()
  }

  async goToAnnotation(annotationId: string) {
    const annotation = this.annotations.find(item => item.id === annotationId)
    if (!annotation || annotation.anchor.format !== 'epub')
      throw new Error(`EPUB annotation ${annotationId} does not exist`)
    const locator = Locator.deserialize(annotation.anchor.locator)
    if (!locator)
      throw new Error(`EPUB annotation ${annotationId} contains an invalid locator`)
    await new Promise<void>((resolve, reject) => {
      this.requireNavigator().go(locator, false, (ok) => {
        if (ok)
          resolve()
        else
          reject(new Error(`Unable to navigate to EPUB annotation ${annotationId}`))
      })
    })
  }

  async recognizeCurrentPage() {
    throw new Error('OCR is only available for PDF documents')
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]) {
    this.annotations = annotations
    this.applyAnnotations()
  }

  async setPresentationMode(mode: ReaderPresentationMode) {
    if (mode === this.presentationMode)
      return
    if (mode === 'reader' && this.parsed.layout !== 'reflowable')
      throw new Error(presentationReason(this.parsed.layout))
    this.presentationMode = mode
    await this.requireNavigator().submitPreferences(preferences(mode, this.scale))
    this.emitState()
  }

  setRegionSelectionEnabled() {
    // EPUB supports stable text selections; free-form page regions are a PDF-only capability.
  }

  async setScale(scale: number) {
    if (this.presentationMode !== 'reader' || this.parsed.layout !== 'reflowable')
      return
    const nextScale = clampScale(scale)
    if (nextScale === this.scale)
      return
    this.scale = nextScale
    await this.requireNavigator().submitPreferences(preferences('reader', this.scale))
    this.emitState()
  }

  private requireNavigator() {
    if (!this.navigator || this.destroyed)
      throw new Error('EPUB reader is not available')
    return this.navigator
  }

  private applyAnnotations() {
    const navigator = this.navigator
    if (!navigator)
      return
    const decorations = this.annotations
      .map(readiumDecoration)
      .filter((decoration): decoration is Decoration => decoration !== null)
    navigator.applyDecorations(decorations, annotationGroup)
  }

  private handleTextSelection(selection: BasicTextSelection) {
    if (!selection.locator)
      throw new Error('Readium did not provide a locator for the selected text')
    const container = this.container
    if (!container)
      throw new Error('EPUB selection occurred before the reader was mounted')
    const frame = selectionFrame(container, selection.targetFrameSrc)
    const frameRect = frame?.getBoundingClientRect()
    const quote = selectionQuote(frame, selection.text)
    this.callbacks.onSelectionChange({
      clientRect: {
        height: selection.height,
        left: (frameRect?.left ?? container.getBoundingClientRect().left) + selection.x,
        top: (frameRect?.top ?? container.getBoundingClientRect().top) + selection.y,
        width: selection.width,
      },
      selection: {
        anchor: {
          format: 'epub',
          locator: readerLocator(selection.locator, quote),
          quote,
          type: 'text',
        },
        text: selection.text,
        type: 'text',
      },
    })
  }

  private emitState() {
    if (this.destroyed)
      return
    const navigator = this.navigator
    const readingOrder = this.parsed.publication.readingOrder.items
    const resourceIndex = Math.max(0, readingOrder.findIndex(link => link.href === this.currentLocator.href))
    const withinResource = this.currentLocator.locations.progression ?? 0
    const progression = readingOrder.length <= 1
      ? withinResource
      : (resourceIndex + withinResource) / readingOrder.length
    const readerModeAvailable = this.parsed.layout === 'reflowable'
    const state: ReaderAdapterState = {
      canGoBackward: navigator?.canGoBackward ?? resourceIndex > 0,
      canGoForward: navigator?.canGoForward ?? resourceIndex < readingOrder.length - 1,
      capabilities: {
        annotations: true,
        ocr: false,
        presentationModes: readerModeAvailable ? ['publisher', 'reader'] : ['publisher'],
        regionSelection: false,
        scale: readerModeAvailable && this.presentationMode === 'reader',
        textSelection: true,
      },
      format: 'epub',
      location: {
        format: 'epub',
        href: this.currentLocator.href,
        label: `Section ${resourceIndex + 1} of ${readingOrder.length}`,
        position: resourceIndex + 1,
        progression,
        total: readingOrder.length,
      },
      presentationMode: this.presentationMode,
      presentationModeReason: presentationReason(this.parsed.layout),
      scale: this.scale,
      title: this.parsed.title || this.source.name,
    }
    this.callbacks.onStateChange(state)
  }
}

export async function openEpubAdapter(
  source: EpubSource,
  initialPresentationMode: ReaderPresentationMode,
  callbacks: ReaderAdapterCallbacks,
): Promise<ReaderAdapter> {
  const parsed = await parseEpub(source.bytes)
  return new EpubAdapter(source, parsed, initialPresentationMode, callbacks)
}
