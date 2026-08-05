import type {
  ReaderAnnotation,
  ReaderAnnotationColor,
  ReaderPosition,
  ReaderTextQuote,
  ReaderTxtRegionAnchor,
  ReaderTxtTextAnchor,
} from '../../types'
import type {
  ReaderAdapter,
  ReaderAdapterCallbacks,
  ReaderAdapterState,
  ReaderClientRect,
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import type { ResolvedReaderSource } from '../source'
import {
  readerFontSizeScaleCapability,
  readerMaximumScale,
  readerMinimumScale,
} from '../reader-adapter'
import { RegionSelectionController } from '../region-selection'
import { regionSelectionClassNames } from '../region-selection.stylex'
import { readSourceBytes } from '../source'

type TxtSource = ResolvedReaderSource & { format: 'txt' }

const scrollStep = 48
const scrollBoundaryTolerance = 1
const annotationTints: Readonly<Record<ReaderAnnotationColor, string>> = {
  blue: 'rgba(64, 148, 255, 0.34)',
  green: 'rgba(63, 190, 108, 0.34)',
  pink: 'rgba(255, 83, 139, 0.32)',
  purple: 'rgba(140, 98, 255, 0.32)',
  yellow: 'rgba(255, 205, 31, 0.38)',
}

function decodeText(bytes: Uint8Array): string {
  let encoding = 'utf-8'
  let offset = 0
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    offset = 3
  }
  else if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    encoding = 'utf-16le'
    offset = 2
  }
  else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    encoding = 'utf-16be'
    offset = 2
  }
  else if (bytes.byteLength >= 4) {
    const sampleLength = Math.min(bytes.byteLength, 512)
    let evenZeros = 0
    let oddZeros = 0
    for (let index = 0; index < sampleLength; index += 1) {
      if (bytes[index] === 0)
        index % 2 === 0 ? evenZeros += 1 : oddZeros += 1
    }
    if (oddZeros > sampleLength / 8 && evenZeros === 0)
      encoding = 'utf-16le'
    else if (evenZeros > sampleLength / 8 && oddZeros === 0)
      encoding = 'utf-16be'
  }

  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset)).replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  }
  catch (error) {
    throw new Error('This TXT file is not valid UTF-8 or UTF-16 text', { cause: error })
  }
}

function clampScale(value: number): number {
  return Math.min(readerMaximumScale, Math.max(readerMinimumScale, Math.round(value * 10) / 10))
}

function keyboardScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function boundingClientRect(rects: readonly DOMRect[]): ReaderClientRect {
  const left = Math.min(...rects.map(rect => rect.left))
  const top = Math.min(...rects.map(rect => rect.top))
  const right = Math.max(...rects.map(rect => rect.right))
  const bottom = Math.max(...rects.map(rect => rect.bottom))
  return { height: bottom - top, left, top, width: right - left }
}

function textOffset(article: HTMLElement, container: Node, offset: number): number {
  const prefix = document.createRange()
  prefix.selectNodeContents(article)
  prefix.setEnd(container, offset)
  return prefix.toString().length
}

function textOffsetAtPoint(article: HTMLElement, x: number, y: number): number | null {
  const document = article.ownerDocument
  const caret = document.caretPositionFromPoint(x, y)
  if (caret && article.contains(caret.offsetNode))
    return textOffset(article, caret.offsetNode, caret.offset)

  const range = document.caretRangeFromPoint(x, y)
  if (range && article.contains(range.startContainer))
    return textOffset(article, range.startContainer, range.startOffset)
  return null
}

function textOffsetsWithinRect(article: HTMLElement, rect: ReaderClientRect): { end: number, start: number } {
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  const points = [
    [rect.left + 1, rect.top + 1],
    [right - 1, rect.top + 1],
    [rect.left + 1, bottom - 1],
    [right - 1, bottom - 1],
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
  ] as const
  const offsets = points
    .map(([x, y]) => textOffsetAtPoint(article, x, y))
    .filter((offset): offset is number => offset !== null)
  if (offsets.length === 0)
    throw new Error('TXT area selection does not intersect document text')
  const start = Math.min(...offsets)
  const end = Math.max(...offsets)
  if (start === end)
    throw new Error('TXT area selection is too small to anchor to document text')
  return { end, start }
}

function textPointAtOffset(article: HTMLElement, offset: number): { node: Text, offset: number } {
  const walker = article.ownerDocument.createTreeWalker(article, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let lastText: Text | null = null
  while (walker.nextNode()) {
    const text = walker.currentNode as Text
    lastText = text
    if (remaining <= text.data.length)
      return { node: text, offset: remaining }
    remaining -= text.data.length
  }
  if (lastText && remaining === 0)
    return { node: lastText, offset: lastText.data.length }
  throw new Error(`TXT text offset ${offset} is outside the document`)
}

function textRange(article: HTMLElement, start: number, end: number): Range {
  const startPoint = textPointAtOffset(article, start)
  const endPoint = textPointAtOffset(article, end)
  const range = article.ownerDocument.createRange()
  range.setStart(startPoint.node, startPoint.offset)
  range.setEnd(endPoint.node, endPoint.offset)
  return range
}

function selectionQuote(text: string, start: number, end: number): ReaderTextQuote {
  return {
    after: text.slice(end, end + 64),
    before: text.slice(Math.max(0, start - 64), start),
    exact: text.slice(start, end),
  }
}

class TxtAdapter implements ReaderAdapter {
  private annotationLayer: HTMLDivElement | null = null
  private annotations: readonly ReaderAnnotation[] = []
  private article: HTMLElement | null = null
  private content: HTMLDivElement | null = null
  private container: HTMLElement | null = null
  private destroyed = false
  private keyboardScrollTarget: { direction: ReaderScrollDirection, value: number } | null = null
  private resizeObserver: ResizeObserver | null = null
  private readonly regionSelection: RegionSelectionController
  private readonly initialOffset: number
  private scale = 1
  private scrollFrame: number | null = null
  private scroller: HTMLDivElement | null = null
  private surface: HTMLDivElement | null = null

  constructor(
    private readonly source: TxtSource,
    private readonly text: string,
    initialPosition: ReaderPosition | null | undefined,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {
    if (initialPosition !== null && initialPosition !== undefined) {
      if (initialPosition.format !== 'txt')
        throw new TypeError(`Cannot restore ${initialPosition.format} position in a TXT reader`)
      if (!Number.isSafeInteger(initialPosition.offset) || initialPosition.offset < 0)
        throw new RangeError('TXT reading position must contain a non-negative character offset')
    }
    this.initialOffset = initialPosition?.format === 'txt'
      ? Math.min(initialPosition.offset, text.length)
      : 0
    this.regionSelection = new RegionSelectionController({
      onEnabledChange: enabled => this.callbacks.onRegionSelectionModeChange(enabled),
      onSelection: (selection) => {
        try {
          this.publishRegionSelection(selection)
        }
        catch (error) {
          this.callbacks.onError(error instanceof Error ? error : new Error(String(error)))
        }
      },
    })
  }

  async mount(container: HTMLElement): Promise<void> {
    if (this.destroyed)
      throw new Error('Cannot mount a destroyed TXT reader')
    if (this.container)
      throw new Error('TXT reader is already mounted')
    this.container = container
    const surface = document.createElement('div')
    Object.assign(surface.style, {
      height: '100%',
      overflow: 'hidden',
      position: 'relative',
      width: '100%',
    })
    const scroller = document.createElement('div')
    scroller.tabIndex = 0
    Object.assign(scroller.style, {
      background: '#fff',
      boxSizing: 'border-box',
      height: '100%',
      overflow: 'auto',
      padding: '48px 24px 72px',
      scrollBehavior: 'auto',
      width: '100%',
    })
    const content = document.createElement('div')
    Object.assign(content.style, {
      minHeight: '100%',
      position: 'relative',
    })
    const article = document.createElement('article')
    article.setAttribute('aria-label', this.source.name)
    Object.assign(article.style, {
      color: 'rgba(26, 26, 29, 0.94)',
      fontFamily: 'ui-serif, Georgia, serif',
      fontSize: '17px',
      lineHeight: '1.72',
      margin: '0 auto',
      maxWidth: '72ch',
      overflowWrap: 'break-word',
      tabSize: '4',
      whiteSpace: 'pre-wrap',
      wordBreak: 'normal',
    })
    article.addEventListener('pointerup', () => queueMicrotask(() => this.captureSelection()))
    article.addEventListener('keyup', () => queueMicrotask(() => this.captureSelection()))
    article.addEventListener('click', event => this.activateAnnotation(event))
    scroller.addEventListener('scroll', () => this.scheduleState())
    const annotationLayer = document.createElement('div')
    annotationLayer.className = regionSelectionClassNames.annotations
    const regionCapture = document.createElement('div')
    regionCapture.setAttribute('aria-hidden', 'true')
    content.append(article, annotationLayer)
    scroller.append(content)
    surface.append(scroller, regionCapture)
    container.append(surface)
    this.surface = surface
    this.scroller = scroller
    this.content = content
    this.article = article
    this.annotationLayer = annotationLayer
    this.regionSelection.mount(surface, regionCapture)
    this.resizeObserver = new ResizeObserver(() => {
      this.renderRegionAnnotations()
      this.emitState()
    })
    this.resizeObserver.observe(scroller)
    this.renderText()
    this.positionAtTextOffset(this.initialOffset)
    this.emitState()
  }

  clearSelection(): void {
    this.regionSelection.setEnabled(false)
    const selection = document.getSelection()
    if (selection && this.article && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (this.article.contains(range.commonAncestorContainer))
        selection.removeAllRanges()
    }
    this.callbacks.onSelectionChange(null)
  }

  async destroy(): Promise<void> {
    if (this.destroyed)
      return
    this.destroyed = true
    this.regionSelection.destroy()
    if (this.scrollFrame !== null)
      cancelAnimationFrame(this.scrollFrame)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.container?.replaceChildren()
    this.container = null
    this.surface = null
    this.content = null
    this.annotationLayer = null
  }

  async goBackward(_entryEdge: ReaderPageEdge): Promise<void> {
    this.movePage(-1)
  }

  async goForward(_entryEdge: ReaderPageEdge): Promise<void> {
    this.movePage(1)
  }

  async goToAnnotation(annotationId: string): Promise<void> {
    const annotation = this.annotations.find(item => item.id === annotationId)
    if (!annotation || annotation.anchor.format !== 'txt')
      throw new Error(`TXT annotation ${annotationId} does not exist`)
    const marker = this.content?.querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(annotationId)}"]`)
    if (!marker)
      throw new Error(`TXT annotation ${annotationId} is outside the document`)
    marker.scrollIntoView({ behavior: keyboardScrollBehavior(), block: 'center' })
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    const scroller = this.scroller
    if (!scroller)
      return 'at-boundary'
    const vertical = direction === 'down' || direction === 'up'
    if (!vertical)
      return 'at-boundary'
    const current = scroller.scrollTop
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const boundary = direction === 'down' ? maximum : 0
    if (maximum <= scrollBoundaryTolerance || Math.abs(boundary - current) <= scrollBoundaryTolerance) {
      this.keyboardScrollTarget = null
      return 'at-boundary'
    }
    const delta = direction === 'down' ? scrollStep : -scrollStep
    const base = this.keyboardScrollTarget?.direction === direction ? this.keyboardScrollTarget.value : current
    const next = Math.min(maximum, Math.max(0, base + delta))
    this.keyboardScrollTarget = { direction, value: next }
    scroller.scrollTo({ behavior: keyboardScrollBehavior(), top: next })
    return 'scrolled'
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    this.annotations = annotations
    this.renderText()
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    this.regionSelection.setEnabled(enabled)
  }

  async setScale(scale: number): Promise<void> {
    const nextScale = clampScale(scale)
    if (nextScale === this.scale)
      return
    this.scale = nextScale
    this.clearSelection()
    if (this.article)
      this.article.style.fontSize = `${17 * this.scale}px`
    this.renderRegionAnnotations()
    this.emitState()
  }

  private movePage(direction: -1 | 1): void {
    const scroller = this.scroller
    if (!scroller)
      return
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    const amount = Math.max(1, scroller.clientHeight * 0.9)
    const next = Math.min(maximum, Math.max(0, scroller.scrollTop + direction * amount))
    this.keyboardScrollTarget = null
    scroller.scrollTo({ behavior: keyboardScrollBehavior(), top: next })
  }

  private captureSelection(): void {
    const article = this.article
    const selection = document.getSelection()
    if (!article || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      this.callbacks.onSelectionChange(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!article.contains(range.startContainer) || !article.contains(range.endContainer))
      return
    const start = textOffset(article, range.startContainer, range.startOffset)
    const end = textOffset(article, range.endContainer, range.endOffset)
    if (start === end) {
      this.callbacks.onSelectionChange(null)
      return
    }
    const selectionStart = Math.min(start, end)
    const selectionEnd = Math.max(start, end)
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
    if (rects.length === 0)
      throw new Error('TXT selection did not produce a visible text rectangle')
    const anchor: ReaderTxtTextAnchor = {
      end: selectionEnd,
      format: 'txt',
      quote: selectionQuote(this.text, selectionStart, selectionEnd),
      start: selectionStart,
      type: 'text',
    }
    this.callbacks.onSelectionChange({
      clientRect: boundingClientRect(rects),
      selection: { anchor, text: anchor.quote.exact, type: 'text' },
    })
  }

  private publishRegionSelection(result: RegionSelectionResult | null): void {
    if (!result) {
      this.callbacks.onSelectionChange(null)
      return
    }
    const article = this.article
    if (!article)
      throw new Error('TXT region selection occurred before the reader was mounted')
    const offsets = textOffsetsWithinRect(article, result.clientRect)
    const anchor: ReaderTxtRegionAnchor = {
      end: offsets.end,
      format: 'txt',
      start: offsets.start,
      type: 'region',
    }
    this.callbacks.onSelectionChange({
      clientRect: result.clientRect,
      selection: { anchor, type: 'region' },
    })
  }

  private activateAnnotation(event: MouseEvent): void {
    const selection = document.getSelection()
    if (selection && !selection.isCollapsed)
      return
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-annotation-id]') : null
    const annotationId = target?.dataset.annotationId
    if (annotationId)
      this.callbacks.onAnnotationActivate({ annotationId })
  }

  private renderText(): void {
    const article = this.article
    const scroller = this.scroller
    if (!article || !scroller)
      return
    const scrollTop = scroller.scrollTop
    const annotations = this.annotations
      .filter((annotation): annotation is ReaderAnnotation & { anchor: ReaderTxtTextAnchor } => (
        annotation.anchor.format === 'txt'
        && annotation.anchor.type === 'text'
        && annotation.anchor.start >= 0
        && annotation.anchor.end <= this.text.length
        && annotation.anchor.start < annotation.anchor.end
      ))
    const boundaries = [...new Set([
      0,
      this.text.length,
      ...annotations.flatMap(annotation => [annotation.anchor.start, annotation.anchor.end]),
    ])].sort((left, right) => left - right)
    const fragment = document.createDocumentFragment()
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index]
      const end = boundaries[index + 1]
      if (start === undefined || end === undefined || end <= start)
        continue
      const active = annotations
        .filter(annotation => annotation.anchor.start <= start && annotation.anchor.end >= end)
        .sort((left, right) => right.updatedAt - left.updatedAt)[0]
      if (!active) {
        fragment.append(document.createTextNode(this.text.slice(start, end)))
        continue
      }
      const marker = document.createElement('span')
      marker.dataset.annotationId = active.id
      marker.style.backgroundColor = annotationTints[active.color]
      if (active.kind === 'annotation')
        marker.style.textDecoration = `underline 1.5px ${annotationTints[active.color]}`
      marker.textContent = this.text.slice(start, end)
      fragment.append(marker)
    }
    article.replaceChildren(fragment)
    scroller.scrollTop = scrollTop
    this.renderRegionAnnotations()
  }

  private renderRegionAnnotations(): void {
    const layer = this.annotationLayer
    const article = this.article
    const content = this.content
    if (!layer || !article || !content)
      return
    layer.replaceChildren()
    const contentRect = content.getBoundingClientRect()
    for (const annotation of this.annotations) {
      const anchor = annotation.anchor
      if (anchor.format !== 'txt' || anchor.type !== 'region')
        continue
      if (anchor.start < 0 || anchor.end > this.text.length || anchor.start >= anchor.end)
        throw new Error(`Annotation ${annotation.id} contains invalid TXT region offsets`)
      const rects = [...textRange(article, anchor.start, anchor.end).getClientRects()]
        .filter(rect => rect.width > 0 && rect.height > 0)
      for (const rect of rects) {
        const marker = document.createElement('button')
        marker.className = regionSelectionClassNames.annotation
        marker.dataset.annotationId = annotation.id
        marker.setAttribute('aria-label', this.callbacks.regionAnnotationLabel())
        marker.type = 'button'
        marker.style.backgroundColor = annotationTints[annotation.color]
        marker.style.height = `${rect.height}px`
        marker.style.left = `${rect.left - contentRect.left}px`
        marker.style.top = `${rect.top - contentRect.top}px`
        marker.style.width = `${rect.width}px`
        marker.addEventListener('click', () => {
          this.callbacks.onAnnotationActivate({ annotationId: annotation.id })
        })
        layer.append(marker)
      }
    }
  }

  private scheduleState(): void {
    if (this.scrollFrame !== null)
      return
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null
      this.emitState()
    })
  }

  private currentTextOffset(): number {
    const article = this.article
    const scroller = this.scroller
    if (!article || !scroller || this.text.length === 0)
      return 0
    const articleRect = article.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const x = articleRect.left + Math.min(8, Math.max(1, articleRect.width / 2))
    const y = Math.min(articleRect.bottom - 1, Math.max(articleRect.top + 1, scrollerRect.top + 8))
    const offset = textOffsetAtPoint(article, x, y)
    if (offset !== null)
      return offset
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    return maximum === 0 ? 0 : Math.round((scroller.scrollTop / maximum) * this.text.length)
  }

  private positionAtTextOffset(offset: number): void {
    const article = this.article
    const scroller = this.scroller
    if (!article || !scroller || this.text.length === 0 || offset === 0) {
      if (scroller)
        scroller.scrollTop = 0
      return
    }
    const start = Math.min(offset, this.text.length - 1)
    const rect = textRange(article, start, start + 1).getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    scroller.scrollTop = Math.max(0, scroller.scrollTop + rect.top - scrollerRect.top - 8)
  }

  private emitState(): void {
    if (this.destroyed)
      return
    const scroller = this.scroller
    const maximum = scroller ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : 0
    const scrollTop = scroller?.scrollTop ?? 0
    const pageHeight = Math.max(1, (scroller?.clientHeight ?? 1) * 0.9)
    const total = Math.max(1, Math.ceil(maximum / pageHeight) + 1)
    const position = Math.min(total, Math.floor(scrollTop / pageHeight) + 1)
    const state: ReaderAdapterState = {
      canGoBackward: scrollTop > scrollBoundaryTolerance,
      canGoForward: maximum - scrollTop > scrollBoundaryTolerance,
      capabilities: {
        annotations: true,
        regionSelection: true,
        scale: readerFontSizeScaleCapability,
        textSelection: true,
      },
      format: 'txt',
      location: {
        format: 'txt',
        label: `Page ${position} of ${total}`,
        position,
        progression: maximum === 0 ? 1 : scrollTop / maximum,
        total,
      },
      outline: [],
      position: { format: 'txt', offset: this.currentTextOffset() },
      presentationMode: 'reader',
      scale: this.scale,
      title: this.source.name,
    }
    this.callbacks.onStateChange(state)
  }
}

export async function openTxtAdapter(
  source: TxtSource,
  initialPosition: ReaderPosition | null | undefined,
  callbacks: ReaderAdapterCallbacks,
): Promise<ReaderAdapter> {
  return new TxtAdapter(source, decodeText(await readSourceBytes(source)), initialPosition, callbacks)
}
