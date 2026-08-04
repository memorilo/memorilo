import type {
  ReaderAnnotation,
  ReaderAnnotationColor,
  ReaderTextQuote,
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
import { readerMaximumScale, readerMinimumScale } from '../reader-adapter'

interface TxtSource {
  bytes: Uint8Array
  format: 'txt'
  name: string
}

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

function selectionQuote(text: string, start: number, end: number): ReaderTextQuote {
  return {
    after: text.slice(end, end + 64),
    before: text.slice(Math.max(0, start - 64), start),
    exact: text.slice(start, end),
  }
}

class TxtAdapter implements ReaderAdapter {
  private annotations: readonly ReaderAnnotation[] = []
  private article: HTMLElement | null = null
  private container: HTMLElement | null = null
  private destroyed = false
  private keyboardScrollTarget: { direction: ReaderScrollDirection, value: number } | null = null
  private resizeObserver: ResizeObserver | null = null
  private scale = 1
  private scrollFrame: number | null = null
  private scroller: HTMLDivElement | null = null

  constructor(
    private readonly source: TxtSource,
    private readonly text: string,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {}

  async mount(container: HTMLElement): Promise<void> {
    if (this.destroyed)
      throw new Error('Cannot mount a destroyed TXT reader')
    if (this.container)
      throw new Error('TXT reader is already mounted')
    this.container = container
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
    scroller.append(article)
    container.append(scroller)
    this.scroller = scroller
    this.article = article
    this.resizeObserver = new ResizeObserver(() => this.emitState())
    this.resizeObserver.observe(scroller)
    this.renderText()
    this.emitState()
  }

  clearSelection(): void {
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
    if (this.scrollFrame !== null)
      cancelAnimationFrame(this.scrollFrame)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.container?.replaceChildren()
    this.container = null
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
    const marker = this.article?.querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(annotationId)}"]`)
    if (!marker)
      throw new Error(`TXT annotation ${annotationId} is outside the document`)
    marker.scrollIntoView({ behavior: keyboardScrollBehavior(), block: 'center' })
  }

  async goToOutlineItem(): Promise<void> {
    throw new Error('TXT documents do not provide a table of contents')
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

  async recognizeCurrentPage(): Promise<void> {
    throw new Error('OCR is only available for PDF documents')
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    this.annotations = annotations
    this.renderText()
  }

  async setPresentationMode(): Promise<void> {
    // Plain text is always shown in the reader's reflowable presentation.
  }

  setRegionSelectionEnabled(): void {
    // TXT supports stable text selections, not free-form regions.
  }

  async setScale(scale: number): Promise<void> {
    const nextScale = clampScale(scale)
    if (nextScale === this.scale)
      return
    this.scale = nextScale
    this.clearSelection()
    if (this.article)
      this.article.style.fontSize = `${17 * this.scale}px`
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
  }

  private scheduleState(): void {
    if (this.scrollFrame !== null)
      return
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null
      this.emitState()
    })
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
        ocr: false,
        presentationModes: ['reader'],
        regionSelection: false,
        scale: true,
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
      presentationMode: 'reader',
      scale: this.scale,
      title: this.source.name,
    }
    this.callbacks.onStateChange(state)
  }
}

export function openTxtAdapter(source: TxtSource, callbacks: ReaderAdapterCallbacks): ReaderAdapter {
  return new TxtAdapter(source, decodeText(source.bytes), callbacks)
}
