import type { Decoration, DecorationObserver } from '@readium/navigator'
import type { BasicTextSelection } from '@readium/navigator-html-injectables'
import type { Link } from '@readium/shared'
import type {
  ReaderAnnotation,
  ReaderAnnotationColor,
  ReaderEpubLocator,
  ReaderEpubRegionAnchor,
  ReaderEpubRegionTarget,
  ReaderOutlineItem,
  ReaderPosition,
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
import type { RegionSelectionResult } from '../region-selection'
import type { ResolvedReaderSource } from '../source'
import type { EpubLayoutKind, ParsedEpub } from './epub-parser'
import { DecorationStyleType, EpubNavigator, EpubPreferences } from '@readium/navigator'
import { Locator } from '@readium/shared'
import { fixedPageAnnotationTint } from '../fixed-page/annotations'
import { normalizedRectWithinSurface } from '../fixed-page/geometry'
import {
  readerFontSizeScaleCapability,
  readerMaximumScale,
  readerMinimumScale,
} from '../reader-adapter'
import { RegionSelectionController } from '../region-selection'
import { regionSelectionClassNames } from '../region-selection.stylex'
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

function serializedLocator(locator: Locator): ReaderEpubLocator {
  const serialized = locator.serialize() as ReaderEpubLocator
  if (!serialized.href || !serialized.type)
    throw new Error('Readium returned an invalid locator')
  return serialized
}

function readerLocator(locator: Locator, quote: ReaderTextQuote): ReaderEpubLocator {
  const serialized = serializedLocator(locator)
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

function selectionFrame(container: HTMLElement, targetFrameSrc: string): HTMLIFrameElement {
  const frames = [...container.querySelectorAll('iframe')]
  const matches = frames.filter((frame) => {
    if (frame.src === targetFrameSrc)
      return true
    try {
      return frame.contentWindow?.location.href === targetFrameSrc
    }
    catch {
      return false
    }
  })
  if (matches.length !== 1)
    throw new Error(`Unable to identify the EPUB selection frame (${matches.length} matches)`)
  return matches[0]!
}

function selectionQuote(frame: HTMLIFrameElement, exact: string): ReaderTextQuote {
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
  if (annotation.anchor.format !== 'epub' || annotation.anchor.type !== 'text')
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

interface VisibleEpubFrame {
  frame: HTMLIFrameElement
  href: string
}

function visibleEpubFrames(container: HTMLElement, navigator: EpubNavigator): readonly VisibleEpubFrame[] {
  const containerRect = container.getBoundingClientRect()
  const frames = [...container.querySelectorAll('iframe')].filter((frame) => {
    const rect = frame.getBoundingClientRect()
    const style = getComputedStyle(frame)
    return rect.width > 0
      && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && intersectionArea(rect, containerRect) > 0
  })
  const readingOrder = navigator.viewport.readingOrder
  const fixedLayout = frames.some(frame => frame.dataset.originalHref !== undefined)
  if (fixedLayout) {
    return frames.flatMap((frame) => {
      const href = frame.dataset.originalHref
      return href && readingOrder.includes(href) ? [{ frame, href }] : []
    })
  }
  if (frames.length !== 1 || readingOrder.length !== 1)
    return []
  return [{ frame: frames[0]!, href: readingOrder[0]! }]
}

function intersectionArea(left: DOMRectReadOnly, right: DOMRectReadOnly): number {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
  return width * height
}

function selectedEpubFrame(
  frames: readonly VisibleEpubFrame[],
  clientRect: DOMRectReadOnly,
): VisibleEpubFrame {
  const matches = frames.filter(frame => intersectionArea(clientRect, frame.frame.getBoundingClientRect()) > 0)
  if (matches.length === 0)
    throw new Error('EPUB area selection does not intersect a loaded publication page')
  if (matches.length > 1)
    throw new Error('EPUB area selection cannot span multiple publication pages')
  return matches[0]!
}

function intersectionRect(left: DOMRectReadOnly, right: DOMRectReadOnly): DOMRect | null {
  const x = Math.max(left.left, right.left)
  const y = Math.max(left.top, right.top)
  const width = Math.max(0, Math.min(left.right, right.right) - x)
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - y)
  return width > 0 && height > 0 ? new DOMRect(x, y, width, height) : null
}

function stableSelector(element: Element): string {
  const document = element.ownerDocument
  if (element.id) {
    const byId = `#${CSS.escape(element.id)}`
    if (document.querySelectorAll(byId).length === 1)
      return byId
  }

  const segments: string[] = []
  let current: Element | null = element
  while (current) {
    const name = CSS.escape(current.localName)
    const siblings = current.parentElement
      ? [...current.parentElement.children].filter(sibling => sibling.localName === current!.localName)
      : [current]
    segments.unshift(`${name}:nth-of-type(${siblings.indexOf(current) + 1})`)
    current = current.parentElement
  }
  const selector = segments.join(' > ')
  if (document.querySelectorAll(selector).length !== 1)
    throw new Error('Unable to create a stable selector for EPUB area selection')
  return selector
}

function isMediaAnchor(element: Element): boolean {
  return ['canvas', 'img', 'picture', 'svg', 'video'].includes(element.localName)
}

function hasDirectText(element: Element): boolean {
  return [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
}

function regionTargetsForFrame(frame: HTMLIFrameElement, clientRect: DOMRectReadOnly): ReaderEpubRegionTarget[] {
  const frameRect = frame.getBoundingClientRect()
  const frameWindow = frame.contentWindow
  const frameDocument = frame.contentDocument
  if (!frameWindow || !frameDocument?.body)
    throw new Error('EPUB area selection frame is not ready')
  const clipped = intersectionRect(clientRect, frameRect)
  if (!clipped)
    throw new Error('EPUB area selection does not intersect its publication page')
  const scaleX = frameWindow.innerWidth / frameRect.width
  const scaleY = frameWindow.innerHeight / frameRect.height
  const contentRect = new DOMRect(
    (clipped.left - frameRect.left) * scaleX,
    (clipped.top - frameRect.top) * scaleY,
    clipped.width * scaleX,
    clipped.height * scaleY,
  )
  const candidates = [...frameDocument.body.querySelectorAll('*')].filter((element) => {
    if (!isMediaAnchor(element) && !hasDirectText(element))
      return false
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && intersectionArea(rect, contentRect) > 0
  })
  const mediaCandidates = candidates.filter(isMediaAnchor)
  const preferred = mediaCandidates.length > 0 ? mediaCandidates : candidates
  const outermost = preferred.length > 0
    ? preferred.filter(element => !preferred.some(other => other !== element && other.contains(element)))
    : frame.dataset.originalHref !== undefined
      ? [frameDocument.body]
      : []
  if (outermost.length === 0)
    throw new Error('EPUB area selection does not intersect anchorable content')
  return outermost.map((element) => {
    const elementRect = element.getBoundingClientRect()
    const overlap = intersectionRect(contentRect, elementRect)
    const rect = overlap && normalizedRectWithinSurface(overlap, elementRect)
    if (!rect)
      throw new Error('EPUB area selection produced an invalid content rectangle')
    return { rect, selector: stableSelector(element) }
  })
}

function markerRectForTarget(
  target: ReaderEpubRegionTarget,
  frame: HTMLIFrameElement,
): { frameScaleX: number, frameScaleY: number, height: number, left: number, top: number, width: number } | null {
  const frameWindow = frame.contentWindow
  const frameDocument = frame.contentDocument
  if (!frameWindow || !frameDocument)
    return null
  const element = frameDocument.querySelector(target.selector)
  if (!element)
    return null
  const elementRect = element.getBoundingClientRect()
  const frameRect = frame.getBoundingClientRect()
  if (elementRect.width <= 0 || elementRect.height <= 0 || frameWindow.innerWidth <= 0 || frameWindow.innerHeight <= 0)
    return null
  return {
    frameScaleX: frameRect.width / frameWindow.innerWidth,
    frameScaleY: frameRect.height / frameWindow.innerHeight,
    left: elementRect.left + target.rect.x * elementRect.width,
    top: elementRect.top + target.rect.y * elementRect.height,
    width: target.rect.width * elementRect.width,
    height: target.rect.height * elementRect.height,
  }
}

function locatorIsVisible(locator: Locator, navigator: EpubNavigator): boolean {
  if (!navigator.viewport.readingOrder.includes(locator.href))
    return false
  const progression = locator.locations.progression
  const visibleProgression = navigator.viewport.progressions.get(locator.href)
  if (progression === undefined || visibleProgression === undefined)
    return true
  const tolerance = 0.000_001
  return progression >= visibleProgression.start - tolerance
    && progression <= visibleProgression.end + tolerance
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
  private annotationLayer: HTMLDivElement | null = null
  private annotations: readonly ReaderAnnotation[] = []
  private container: HTMLElement | null = null
  private currentLocator: Locator
  private destroyed = false
  private navigator: EpubNavigator | null = null
  private readonly keyboardDocuments = new WeakSet<Document>()
  private readonly outline: readonly ReaderOutlineItem[]
  private readonly outlineLinks = new Map<string, Link>()
  private presentationMode: ReaderPresentationMode
  private readonly regionSelection: RegionSelectionController
  private resizeObserver: ResizeObserver | null = null
  private scale = 1
  private surface: HTMLDivElement | null = null
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
    initialPosition: ReaderPosition | null | undefined,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {
    this.regionSelection = new RegionSelectionController({
      onEnabledChange: enabled => this.callbacks.onRegionSelectionModeChange(enabled),
      onSelection: (selection) => {
        try {
          this.publishRegionSelection(selection)
        }
        catch (error) {
          this.callbacks.onError(toError(error))
        }
      },
    })
    this.presentationMode = parsed.layout === 'reflowable' ? initialPresentationMode : 'publisher'
    if (parsed.layout === 'reflowable')
      this.setScale = scale => this.updateScale(scale)
    if (initialPosition !== null && initialPosition !== undefined && initialPosition.format !== 'epub')
      throw new TypeError(`Cannot restore ${initialPosition.format} position in an EPUB reader`)
    const restoredLocator = initialPosition?.format === 'epub'
      ? Locator.deserialize(initialPosition.locator)
      : undefined
    const initialLocator = restoredLocator && parsed.publication.readingOrder.items
      .some(item => item.href === restoredLocator.href)
      ? restoredLocator
      : parsed.positions[0]
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
    const annotationLayer = document.createElement('div')
    annotationLayer.className = regionSelectionClassNames.annotations
    const regionCapture = document.createElement('div')
    regionCapture.setAttribute('aria-hidden', 'true')
    navigatorContainer.append(annotationLayer, regionCapture)
    container.append(navigatorContainer)
    this.surface = navigatorContainer
    this.annotationLayer = annotationLayer
    this.regionSelection.mount(navigatorContainer, regionCapture)

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
          this.renderRegionAnnotations()
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
    this.resizeObserver = new ResizeObserver(() => this.renderRegionAnnotations())
    this.resizeObserver.observe(navigatorContainer)
    this.emitState()
  }

  clearSelection() {
    this.regionSelection.setEnabled(false)
    for (const frame of this.container?.querySelectorAll('iframe') ?? [])
      frame.contentWindow?.getSelection()?.removeAllRanges()
    this.callbacks.onSelectionChange(null)
  }

  async destroy() {
    if (this.destroyed)
      return
    this.destroyed = true
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.regionSelection.destroy()
    const navigator = this.navigator
    this.navigator = null
    if (navigator) {
      navigator.unregisterDecorationObserver(this.decorationObserver)
      await navigator.destroy()
    }
    this.container?.replaceChildren()
    this.container = null
    this.surface = null
    this.annotationLayer = null
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
    this.currentLocator = this.requireNavigator().currentLocator
    this.renderRegionAnnotations()
    this.emitState()
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

  setRegionSelectionEnabled(enabled: boolean) {
    this.regionSelection.setEnabled(enabled)
  }

  private async updateScale(scale: number) {
    const nextScale = clampScale(scale)
    if (nextScale === this.scale)
      return
    this.scale = nextScale
    this.clearSelection()
    await this.requireNavigator().submitPreferences(preferences(this.presentationMode, this.scale))
    this.renderRegionAnnotations()
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
    this.renderRegionAnnotations()
  }

  private locatorForFrame(href: string): Locator {
    const navigator = this.requireNavigator()
    const base = this.currentLocator.href === href
      ? this.currentLocator
      : this.parsed.positions.find(locator => locator.href === href)
    if (!base)
      throw new Error(`EPUB frame ${href} does not have a locator`)
    const progression = navigator.viewport.progressions.get(href)?.start
    return progression === undefined ? base : base.copyWithLocations({ progression })
  }

  private publishRegionSelection(result: RegionSelectionResult | null) {
    if (!result) {
      this.callbacks.onSelectionChange(null)
      return
    }
    const surface = this.surface
    if (!surface)
      throw new Error('EPUB region selection occurred before the reader was mounted')
    const clientRect = new DOMRect(
      result.clientRect.left,
      result.clientRect.top,
      result.clientRect.width,
      result.clientRect.height,
    )
    const visibleFrame = selectedEpubFrame(
      visibleEpubFrames(surface, this.requireNavigator()),
      clientRect,
    )
    const anchor: ReaderEpubRegionAnchor = {
      format: 'epub',
      locator: serializedLocator(this.locatorForFrame(visibleFrame.href)),
      targets: regionTargetsForFrame(visibleFrame.frame, clientRect),
      type: 'region',
    }
    this.callbacks.onSelectionChange({
      clientRect: result.clientRect,
      selection: { anchor, type: 'region' },
    })
  }

  private renderRegionAnnotations() {
    const layer = this.annotationLayer
    const surface = this.surface
    const navigator = this.navigator
    if (!layer || !surface || !navigator)
      return
    layer.replaceChildren()
    const surfaceRect = surface.getBoundingClientRect()
    const frames = visibleEpubFrames(surface, navigator)
    for (const annotation of this.annotations) {
      const anchor = annotation.anchor
      if (anchor.format !== 'epub' || anchor.type !== 'region')
        continue
      const locator = Locator.deserialize(anchor.locator)
      if (!locator)
        throw new Error(`Annotation ${annotation.id} contains an invalid EPUB locator`)
      if (!locatorIsVisible(locator, navigator))
        continue
      const visibleFrame = frames.find(frame => frame.href === locator.href)
      if (!visibleFrame)
        continue
      const frameRect = visibleFrame.frame.getBoundingClientRect()
      for (const target of anchor.targets) {
        const targetRect = markerRectForTarget(target, visibleFrame.frame)
        if (!targetRect)
          continue
        const marker = document.createElement('button')
        marker.className = regionSelectionClassNames.annotation
        marker.dataset.annotationId = annotation.id
        marker.setAttribute('aria-label', this.callbacks.regionAnnotationLabel())
        marker.type = 'button'
        marker.style.backgroundColor = fixedPageAnnotationTint(annotation.color)
        marker.style.height = `${targetRect.height * targetRect.frameScaleY}px`
        marker.style.left = `${frameRect.left - surfaceRect.left + targetRect.left * targetRect.frameScaleX}px`
        marker.style.top = `${frameRect.top - surfaceRect.top + targetRect.top * targetRect.frameScaleY}px`
        marker.style.width = `${targetRect.width * targetRect.frameScaleX}px`
        marker.addEventListener('click', () => {
          this.callbacks.onAnnotationActivate({ annotationId: annotation.id })
        })
        layer.append(marker)
      }
    }
  }

  private handleTextSelection(selection: BasicTextSelection) {
    if (!selection.locator)
      throw new Error('Readium did not provide a locator for the selected text')
    const container = this.container
    if (!container)
      throw new Error('EPUB selection occurred before the reader was mounted')
    const frame = selectionFrame(container, selection.targetFrameSrc)
    const frameRect = frame.getBoundingClientRect()
    const quote = selectionQuote(frame, selection.text)
    this.callbacks.onSelectionChange({
      clientRect: {
        height: selection.height,
        left: frameRect.left + selection.x,
        top: frameRect.top + selection.y,
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
        regionSelection: true,
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
      position: { format: 'epub', locator: serializedLocator(this.currentLocator) },
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
  initialPosition: ReaderPosition | null | undefined,
  callbacks: ReaderAdapterCallbacks,
): Promise<ReaderAdapter> {
  const parsed = await parseEpub(source)
  return new EpubAdapter(source, parsed, initialPresentationMode, initialPosition, callbacks)
}
