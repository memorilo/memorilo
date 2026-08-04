import type { Decoration, DecorationObserver } from '@readium/navigator'
import type { BasicTextSelection } from '@readium/navigator-html-injectables'
import type { Link } from '@readium/shared'
import type {
  ReaderAnnotation,
  ReaderAnnotationColor,
  ReaderEpubLocator,
  ReaderOutlineItem,
  ReaderPresentationMode,
  ReaderTextQuote,
} from '../../types'
import type {
  ReaderAdapter,
  ReaderAdapterCallbacks,
  ReaderAdapterKeyboardEvent,
  ReaderAdapterState,
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { ResolvedReaderSource } from '../source'
import type { EpubLayoutKind, ParsedEpub } from './epub-parser'
import { DecorationStyleType, EpubNavigator, EpubPreferences } from '@readium/navigator'
import { Locator } from '@readium/shared'
import {
  readerFontSizeScaleCapability,
  readerMaximumScale,
  readerMinimumScale,
} from '../reader-adapter'
import { parseEpub } from './epub-parser'
import './epub-layer.css'

type EpubSource = ResolvedReaderSource & { format: 'epub' }

const annotationGroup = 'memorilo-annotations'

const annotationTints: Record<ReaderAnnotationColor, string> = {
  blue: '#77B7FF',
  green: '#75D49B',
  pink: '#FF8DB3',
  purple: '#B99BFF',
  yellow: '#FFD84D',
}

function clampScale(value: number) {
  return Math.min(readerMaximumScale, Math.max(readerMinimumScale, Math.round(value * 10) / 10))
}

function isInteractiveKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function')
    return false
  return (target as Element).closest('button, input, select, textarea, [contenteditable="true"]') !== null
}

function readerKeyboardEvent(event: KeyboardEvent): ReaderAdapterKeyboardEvent {
  return {
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    key: event.key,
    metaKey: event.metaKey,
    repeat: event.repeat,
    shiftKey: event.shiftKey,
  }
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
    fontSize: scale === 1 ? null : scale,
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

function epubOutline(
  links: readonly Link[],
  linksById: Map<string, Link>,
  parentPath = 'epub',
): ReaderOutlineItem[] {
  return links.map((link, index) => {
    const id = `${parentPath}.${index}`
    linksById.set(id, link)
    return {
      children: epubOutline(link.children?.items ?? [], linksById, id),
      href: link.href,
      id,
      label: link.title?.trim() || link.href,
      navigable: true,
    }
  })
}

class EpubAdapter implements ReaderAdapter {
  private annotations: readonly ReaderAnnotation[] = []
  private container: HTMLElement | null = null
  private currentLocator: Locator
  private destroyed = false
  private navigator: EpubNavigator | null = null
  private readonly keyboardDocuments = new WeakSet<Document>()
  private readonly outline: readonly ReaderOutlineItem[]
  private readonly outlineLinks = new Map<string, Link>()
  private presentationMode: ReaderPresentationMode
  private scale = 1
  readonly setScale?: (scale: number) => Promise<void>

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
    if (parsed.layout === 'reflowable')
      this.setScale = scale => this.updateScale(scale)
    const initialLocator = parsed.positions[0]
    if (!initialLocator)
      throw new Error('EPUB does not contain a readable spine position')
    this.currentLocator = initialLocator
    this.outline = epubOutline(parsed.publication.toc?.items ?? [], this.outlineLinks)
  }

  async mount(container: HTMLElement) {
    if (this.destroyed)
      throw new Error('Cannot mount a destroyed EPUB reader')
    if (this.container)
      throw new Error('EPUB reader is already mounted')
    this.container = container

    const navigatorContainer = document.createElement('div')
    navigatorContainer.className = 'reader-epub-surface'
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
        click: () => true,
        contentProtection: () => undefined,
        contextMenu: () => undefined,
        customEvent: () => undefined,
        frameLoaded: frameWindow => this.observeFrameKeyboard(frameWindow),
        handleLocator: () => true,
        miscPointer: () => undefined,
        peripheral: () => undefined,
        positionChanged: (locator) => {
          this.currentLocator = locator
          this.emitState()
        },
        scroll: () => undefined,
        tap: () => true,
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

  async goBackward(_entryEdge: ReaderPageEdge) {
    const navigator = this.requireNavigator()
    if (!navigator.canGoBackward)
      return
    await new Promise<void>(resolve => navigator.goBackward(false, () => resolve()))
    this.currentLocator = navigator.currentLocator
    this.emitState()
  }

  async goForward(_entryEdge: ReaderPageEdge) {
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

  async goToOutlineItem(outlineItemId: string) {
    const link = this.outlineLinks.get(outlineItemId)
    if (!link)
      throw new Error(`EPUB outline item ${outlineItemId} does not exist`)
    await new Promise<void>((resolve, reject) => {
      this.requireNavigator().goLink(link, false, (ok) => {
        if (ok)
          resolve()
        else
          reject(new Error(`Unable to navigate to EPUB outline item ${outlineItemId}`))
      })
    })
    this.currentLocator = this.requireNavigator().currentLocator
    this.emitState()
  }

  moveViewport(_direction: ReaderScrollDirection): ReaderScrollResult {
    return 'at-boundary'
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]) {
    this.annotations = annotations
    this.applyAnnotations()
  }

  private async updateScale(scale: number) {
    const nextScale = clampScale(scale)
    if (nextScale === this.scale)
      return
    this.scale = nextScale
    await this.requireNavigator().submitPreferences(preferences(this.presentationMode, this.scale))
    this.emitState()
  }

  private requireNavigator() {
    if (!this.navigator || this.destroyed)
      throw new Error('EPUB reader is not available')
    return this.navigator
  }

  private observeFrameKeyboard(frameWindow: Window) {
    const frameDocument = frameWindow.document
    if (this.keyboardDocuments.has(frameDocument))
      return
    this.keyboardDocuments.add(frameDocument)
    frameDocument.addEventListener('keydown', (event) => {
      if (isInteractiveKeyboardTarget(event.target))
        return
      if (!this.callbacks.onKeyDown(readerKeyboardEvent(event)))
        return
      event.preventDefault()
      event.stopPropagation()
    }, true)
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
        ...(readerModeAvailable ? { scale: readerFontSizeScaleCapability } : {}),
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
      outline: this.outline,
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
  const parsed = await parseEpub(source)
  return new EpubAdapter(source, parsed, initialPresentationMode, callbacks)
}
