import type {
  PDFDataRangeTransport,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  PDFWorker,
  RenderTask,
  TextLayer,
} from 'pdfjs-dist'
import type {
  ReaderAnnotation,
  ReaderNormalizedRect,
  ReaderOcrProvider,
  ReaderOcrResult,
  ReaderOcrTextItem,
  ReaderOutlineItem,
  ReaderPdfTextAnchor,
  ReaderPosition,
  ReaderTextLayerKind,
  ReaderTextQuote,
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
import { fixedPageAnnotationTint } from '../fixed-page/annotations'
import { clampFixedPageScale, clampUnit, normalizedRectWithinSurface } from '../fixed-page/geometry'
import { FixedPageViewportController } from '../fixed-page/viewport'
import { readerZoomScaleCapability } from '../reader-adapter'
import { RegionSelectionController } from '../region-selection'
import './pdf-layer.css'

type PdfSource = ResolvedReaderSource & { format: 'pdf' }

interface PdfJsModule {
  AbortException: typeof import('pdfjs-dist').AbortException
  PDFDataRangeTransport: typeof PDFDataRangeTransport
  PDFWorker: typeof PDFWorker
  RenderingCancelledException: typeof import('pdfjs-dist').RenderingCancelledException
  TextLayer: typeof TextLayer
  getDocument: typeof import('pdfjs-dist').getDocument
}

interface PdfReference {
  gen: number
  num: number
}

interface PdfOutlineNode {
  dest: string | unknown[] | null
  items: PdfOutlineNode[]
  title: string
}

type PdfDestination = string | readonly unknown[]

type PdfTextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>

const pdfRangeChunkSize = 64 * 1024

function isPdfReference(value: unknown): value is PdfReference {
  if (typeof value !== 'object' || value === null)
    return false
  const candidate = value as Partial<PdfReference>
  return typeof candidate.num === 'number' && typeof candidate.gen === 'number'
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function createPdfRangeTransport(
  RangeTransport: typeof PDFDataRangeTransport,
  source: PdfSource,
  initialData: Uint8Array,
  onError: (error: Error) => void,
): PDFDataRangeTransport {
  return new class extends RangeTransport {
    private aborted = false

    constructor() {
      super(source.byteLength, initialData)
    }

    override abort(): void {
      this.aborted = true
    }

    override requestDataRange(begin: number, end: number): void {
      void source.read(begin, end - begin).then(
        (bytes) => {
          if (!this.aborted)
            this.onDataRange(begin, bytes)
        },
        (error) => {
          if (!this.aborted)
            onError(toError(error))
        },
      )
    }
  }()
}

function hasExtractedText(content: PdfTextContent): boolean {
  return content.items.some(item => 'str' in item && item.str.trim().length > 0)
}

function validateOcrResult(result: ReaderOcrResult): void {
  for (const [index, item] of result.items.entries()) {
    if (!item.text.trim())
      throw new Error(`OCR text item ${index} must contain text`)
    const { height, width, x, y } = item.rect
    const values = [height, width, x, y]
    if (values.some(value => !Number.isFinite(value)))
      throw new Error(`OCR text item ${index} contains a non-finite rectangle`)
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1)
      throw new Error(`OCR text item ${index} must use a normalized rectangle`)
  }
}

function canvasBlob(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    canvas.toBlob((blob) => {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      if (!blob) {
        reject(new Error('Unable to create a PDF page image for OCR'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

function boundingClientRect(rects: readonly DOMRect[]): ReaderClientRect {
  const left = Math.min(...rects.map(rect => rect.left))
  const top = Math.min(...rects.map(rect => rect.top))
  const right = Math.max(...rects.map(rect => rect.right))
  const bottom = Math.max(...rects.map(rect => rect.bottom))
  return { height: bottom - top, left, top, width: right - left }
}

function selectionQuote(selection: Selection, layer: HTMLElement, exact: string): ReaderTextQuote {
  const range = selection.getRangeAt(0)
  const beforeRange = document.createRange()
  beforeRange.selectNodeContents(layer)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  const afterRange = document.createRange()
  afterRange.selectNodeContents(layer)
  afterRange.setStart(range.endContainer, range.endOffset)
  return {
    after: afterRange.toString().slice(0, 64),
    before: beforeRange.toString().slice(-64),
    exact,
  }
}

function annotationRects(annotation: ReaderAnnotation): readonly ReaderNormalizedRect[] {
  if (annotation.anchor.format !== 'pdf')
    return []
  return annotation.anchor.type === 'region' ? [annotation.anchor.rect] : annotation.anchor.rects
}

class PdfAdapter implements ReaderAdapter {
  private annotationLayer: HTMLDivElement | null = null
  private annotations: readonly ReaderAnnotation[] = []
  private canvas: HTMLCanvasElement | null = null
  private container: HTMLElement | null = null
  private destroyed = false
  private document: PDFDocumentProxy | null = null
  private loadingTask: PDFDocumentLoadingTask | null = null
  private nativeWorker: Worker | null = null
  private ocrAbortController: AbortController | null = null
  private readonly ocrCache = new Map<number, ReaderOcrResult>()
  private page: PDFPageProxy | null = null
  private pageNumber = 1
  private pageSurface: HTMLDivElement | null = null
  private pdfJs: PdfJsModule | null = null
  private pdfWorker: PDFWorker | null = null
  private rangeTransport: PDFDataRangeTransport | null = null
  private readonly regionSelection: RegionSelectionController
  private outline: readonly ReaderOutlineItem[] = []
  private readonly outlineDestinations = new Map<string, PdfDestination>()
  private renderGeneration = 0
  private renderTask: RenderTask | null = null
  private resizeObserver: ResizeObserver | null = null
  private scale = 1
  private scroller: HTMLDivElement | null = null
  private readonly textContentCache = new Map<number, PdfTextContent>()
  private textLayer: HTMLDivElement | null = null
  private textLayerKind: ReaderTextLayerKind = 'none'
  private textLayerTask: TextLayer | null = null
  private viewport: FixedPageViewportController | null = null
  readonly recognizeCurrentPage?: () => Promise<void>

  constructor(
    private readonly source: PdfSource,
    initialPosition: ReaderPosition | null | undefined,
    private readonly ocrProvider: ReaderOcrProvider | undefined,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {
    if (initialPosition !== null && initialPosition !== undefined) {
      if (initialPosition.format !== 'pdf')
        throw new TypeError(`Cannot restore ${initialPosition.format} position in a PDF reader`)
      if (!Number.isSafeInteger(initialPosition.pageNumber) || initialPosition.pageNumber < 1)
        throw new RangeError('PDF reading position must contain a positive page number')
      this.pageNumber = initialPosition.pageNumber
    }
    if (ocrProvider) {
      this.recognizeCurrentPage = async () => {
        this.ocrCache.delete(this.pageNumber)
        await this.renderPage(true)
        this.emitState()
      }
    }
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
  }

  async mount(container: HTMLElement) {
    if (this.destroyed)
      throw new Error('Cannot mount a destroyed PDF reader')
    if (this.container)
      throw new Error('PDF reader is already mounted')

    this.container = container
    const scroller = document.createElement('div')
    scroller.className = 'reader-pdf-scroller'
    scroller.setAttribute('role', 'document')
    scroller.setAttribute('aria-label', this.source.name)

    const pageSurface = document.createElement('div')
    pageSurface.className = 'reader-pdf-page'
    const canvas = document.createElement('canvas')
    canvas.className = 'reader-pdf-canvas'
    canvas.setAttribute('aria-label', `Page ${this.pageNumber}`)
    const annotationLayer = document.createElement('div')
    annotationLayer.className = 'reader-pdf-annotations'
    const textLayer = document.createElement('div')
    textLayer.className = 'reader-pdf-text-layer'
    textLayer.addEventListener('pointerup', () => queueMicrotask(() => this.captureTextSelection()))
    textLayer.addEventListener('keyup', () => queueMicrotask(() => this.captureTextSelection()))
    const regionCapture = document.createElement('div')
    regionCapture.className = 'reader-pdf-region-capture'
    regionCapture.setAttribute('aria-hidden', 'true')

    pageSurface.append(canvas, annotationLayer, textLayer, regionCapture)
    scroller.append(pageSurface)
    container.append(scroller)
    this.scroller = scroller
    this.pageSurface = pageSurface
    this.canvas = canvas
    this.annotationLayer = annotationLayer
    this.textLayer = textLayer
    this.regionSelection.mount(pageSurface, regionCapture)
    this.viewport = new FixedPageViewportController(scroller)

    const [pdfJs, initialData] = await Promise.all([
      import('pdfjs-dist'),
      this.source.read(0, Math.min(this.source.byteLength, pdfRangeChunkSize)),
    ])
    if (this.destroyed)
      return

    this.pdfJs = pdfJs
    const nativeWorker = new Worker(new URL('./pdf.worker.ts', import.meta.url), {
      name: `memorilo-pdf-${crypto.randomUUID()}`,
      type: 'module',
    })
    this.nativeWorker = nativeWorker
    this.pdfWorker = pdfJs.PDFWorker.create({
      name: `memorilo-pdf-${crypto.randomUUID()}`,
      port: nativeWorker,
    })
    const rangeTransport = createPdfRangeTransport(
      pdfJs.PDFDataRangeTransport,
      this.source,
      initialData,
      this.callbacks.onError,
    )
    this.rangeTransport = rangeTransport
    this.loadingTask = pdfJs.getDocument({
      enableXfa: false,
      range: rangeTransport,
      rangeChunkSize: pdfRangeChunkSize,
      stopAtErrors: true,
      worker: this.pdfWorker,
    })
    this.document = await this.loadingTask.promise
    if (this.destroyed)
      return

    this.pageNumber = Math.min(this.pageNumber, this.document.numPages)
    this.loadOutline(await this.document.getOutline())

    this.resizeObserver = new ResizeObserver(() => {
      void this.renderPage(false).catch(this.callbacks.onError)
    })
    this.resizeObserver.observe(scroller)
    await this.renderPage(false)
    this.emitState()
  }

  clearSelection() {
    this.regionSelection.setEnabled(false)
    document.getSelection()?.removeAllRanges()
    this.callbacks.onSelectionChange(null)
  }

  async destroy() {
    if (this.destroyed)
      return
    this.destroyed = true
    this.renderGeneration += 1
    this.rangeTransport?.abort()
    this.rangeTransport = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.ocrAbortController?.abort(new DOMException('PDF reader destroyed', 'AbortError'))
    this.ocrAbortController = null
    this.textLayerTask?.cancel()
    this.textLayerTask = null
    this.renderTask?.cancel()
    this.renderTask = null
    this.page?.cleanup()
    this.page = null
    if (this.loadingTask)
      await this.loadingTask.destroy()
    else if (this.document)
      await this.document.cleanup()
    this.loadingTask = null
    this.document = null
    this.pdfWorker?.destroy()
    this.pdfWorker = null
    this.nativeWorker?.terminate()
    this.nativeWorker = null
    this.regionSelection.destroy()
    this.viewport?.destroy()
    this.viewport = null
    this.scroller?.remove()
    this.scroller = null
    this.pageSurface = null
    this.canvas = null
    this.annotationLayer = null
    this.textLayer = null
    this.container = null
  }

  async goBackward(entryEdge: ReaderPageEdge) {
    if (!this.document || this.pageNumber <= 1)
      return
    this.pageNumber -= 1
    this.clearSelection()
    await this.renderPage(false)
    this.viewport?.positionAtEdge(entryEdge)
    this.emitState()
  }

  async goForward(entryEdge: ReaderPageEdge) {
    if (!this.document || this.pageNumber >= this.document.numPages)
      return
    this.pageNumber += 1
    this.clearSelection()
    await this.renderPage(false)
    this.viewport?.positionAtEdge(entryEdge)
    this.emitState()
  }

  async goToAnnotation(annotationId: string) {
    const annotation = this.annotations.find(item => item.id === annotationId)
    if (!annotation || annotation.anchor.format !== 'pdf')
      throw new Error(`PDF annotation ${annotationId} does not exist`)
    if (annotation.anchor.pageNumber !== this.pageNumber) {
      this.pageNumber = annotation.anchor.pageNumber
      await this.renderPage(false)
      this.emitState()
    }
    this.pageSurface?.scrollIntoView({ block: 'center', inline: 'center' })
  }

  async goToOutlineItem(outlineItemId: string) {
    const documentProxy = this.document
    const destinationValue = this.outlineDestinations.get(outlineItemId)
    if (!documentProxy || !destinationValue)
      throw new Error(`PDF outline item ${outlineItemId} does not have a document destination`)
    const destination = typeof destinationValue === 'string'
      ? await documentProxy.getDestination(destinationValue)
      : destinationValue
    const pageReference = destination?.[0]
    if (pageReference === undefined || pageReference === null)
      throw new Error(`PDF outline item ${outlineItemId} has an invalid destination`)
    const pageIndex = typeof pageReference === 'number'
      ? pageReference
      : isPdfReference(pageReference)
        ? await documentProxy.getPageIndex(pageReference)
        : undefined
    if (pageIndex === undefined || pageIndex < 0 || pageIndex >= documentProxy.numPages)
      throw new Error(`PDF outline item ${outlineItemId} points outside the document`)
    this.pageNumber = pageIndex + 1
    this.clearSelection()
    await this.renderPage(false)
    this.emitState()
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    return this.viewport?.move(direction) ?? 'at-boundary'
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]) {
    this.annotations = annotations
    this.renderAnnotations()
  }

  setRegionSelectionEnabled(enabled: boolean) {
    this.regionSelection.setEnabled(enabled)
  }

  async setScale(scale: number) {
    const nextScale = clampFixedPageScale(scale)
    if (nextScale === this.scale)
      return
    this.scale = nextScale
    this.clearSelection()
    await this.renderPage(false)
    this.emitState()
  }

  private captureTextSelection() {
    try {
      this.handleTextSelection()
    }
    catch (error) {
      this.callbacks.onError(toError(error))
    }
  }

  private emitState() {
    const total = this.document?.numPages ?? 1
    const state: ReaderAdapterState = {
      canGoBackward: this.pageNumber > 1,
      canGoForward: this.pageNumber < total,
      capabilities: {
        annotations: true,
        ...(this.ocrProvider ? { ocr: true } : {}),
        regionSelection: true,
        scale: readerZoomScaleCapability,
        textSelection: this.textLayerKind === 'embedded' || this.textLayerKind === 'ocr',
      },
      format: 'pdf',
      location: {
        format: 'pdf',
        label: `${this.pageNumber} of ${total}`,
        position: this.pageNumber,
        progression: total <= 1 ? 1 : (this.pageNumber - 1) / (total - 1),
        total,
      },
      outline: this.outline,
      position: { format: 'pdf', pageNumber: this.pageNumber },
      presentationMode: 'publisher',
      scale: this.scale,
      textLayer: this.textLayerKind,
      title: this.source.name,
    }
    this.callbacks.onStateChange(state)
  }

  private loadOutline(nodes: PdfOutlineNode[] | null) {
    this.outlineDestinations.clear()
    const convert = (items: PdfOutlineNode[], parentPath: string): ReaderOutlineItem[] => items.map((item, index) => {
      const id = `${parentPath}.${index}`
      if (item.dest)
        this.outlineDestinations.set(id, item.dest)
      return {
        children: convert(item.items, id),
        id,
        label: item.title.trim() || 'Untitled section',
        navigable: item.dest !== null,
      }
    })
    this.outline = convert(nodes ?? [], 'pdf')
  }

  private publishRegionSelection(result: RegionSelectionResult | null) {
    if (!result) {
      this.callbacks.onSelectionChange(null)
      return
    }
    this.callbacks.onSelectionChange({
      clientRect: result.clientRect,
      selection: {
        anchor: {
          format: 'pdf',
          pageNumber: this.pageNumber,
          rect: result.rect,
          type: 'region',
        },
        type: 'region',
      },
    })
  }

  private handleTextSelection() {
    const layer = this.textLayer
    const surface = this.pageSurface
    const selection = document.getSelection()
    if (!layer || !surface || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      this.callbacks.onSelectionChange(null)
      return
    }
    const range = selection.getRangeAt(0)
    if (!layer.contains(range.startContainer) || !layer.contains(range.endContainer))
      return
    const exact = selection.toString().trim()
    if (!exact) {
      this.callbacks.onSelectionChange(null)
      return
    }
    if (this.textLayerKind !== 'embedded' && this.textLayerKind !== 'ocr')
      throw new Error('PDF text was selected without an active text layer')

    const surfaceRect = surface.getBoundingClientRect()
    const domRects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
    const rects = domRects
      .map(rect => normalizedRectWithinSurface(rect, surfaceRect))
      .filter((rect): rect is ReaderNormalizedRect => rect !== null)
    if (rects.length === 0)
      throw new Error('PDF selection did not produce a visible text rectangle')

    const anchor: ReaderPdfTextAnchor = {
      format: 'pdf',
      pageNumber: this.pageNumber,
      quote: selectionQuote(selection, layer, exact),
      rects,
      source: this.textLayerKind,
      type: 'text',
    }
    this.callbacks.onSelectionChange({
      clientRect: boundingClientRect(domRects),
      selection: { anchor, text: exact, type: 'text' },
    })
  }

  private async loadTextContent(page: PDFPageProxy): Promise<PdfTextContent> {
    const cached = this.textContentCache.get(this.pageNumber)
    if (cached)
      return cached
    const content = await page.getTextContent({ disableNormalization: true, includeMarkedContent: true })
    this.textContentCache.set(this.pageNumber, content)
    return content
  }

  private renderAnnotations() {
    const layer = this.annotationLayer
    if (!layer)
      return
    layer.replaceChildren()
    for (const annotation of this.annotations) {
      if (annotation.anchor.format !== 'pdf' || annotation.anchor.pageNumber !== this.pageNumber)
        continue
      const rects = annotationRects(annotation)
      for (const rect of rects) {
        const highlight = document.createElement('div')
        highlight.className = 'reader-pdf-annotation'
        highlight.dataset.kind = annotation.kind
        highlight.style.backgroundColor = fixedPageAnnotationTint(annotation.color)
        highlight.style.left = `${rect.x * 100}%`
        highlight.style.top = `${rect.y * 100}%`
        highlight.style.width = `${rect.width * 100}%`
        highlight.style.height = `${rect.height * 100}%`
        layer.append(highlight)
      }
      if (annotation.kind === 'annotation') {
        const firstRect = rects[0]
        if (!firstRect)
          throw new Error(`PDF annotation ${annotation.id} has no visible anchor rectangle`)
        const marker = document.createElement('button')
        marker.className = 'reader-pdf-note-marker'
        marker.setAttribute('aria-label', this.callbacks.regionAnnotationLabel())
        marker.style.left = `${clampUnit(firstRect.x + firstRect.width) * 100}%`
        marker.style.top = `${firstRect.y * 100}%`
        marker.type = 'button'
        marker.addEventListener('click', () => {
          this.callbacks.onAnnotationActivate({ annotationId: annotation.id })
        })
        layer.append(marker)
      }
    }
  }

  private async renderEmbeddedText(content: PdfTextContent, viewport: ReturnType<PDFPageProxy['getViewport']>, generation: number) {
    const layer = this.textLayer
    const pdfJs = this.pdfJs
    if (!layer || !pdfJs)
      throw new Error('PDF text layer is not mounted')
    layer.replaceChildren()
    layer.classList.remove('reader-pdf-text-layer-ocr')
    const textLayer = new pdfJs.TextLayer({ container: layer, textContentSource: content, viewport })
    this.textLayerTask = textLayer
    try {
      await textLayer.render()
    }
    catch (error) {
      if (generation === this.renderGeneration && !this.destroyed)
        throw error
      return
    }
    finally {
      if (this.textLayerTask === textLayer)
        this.textLayerTask = null
    }
    if (generation !== this.renderGeneration || this.destroyed)
      return
    this.textLayerKind = 'embedded'
    this.callbacks.onOcrStatusChange({ pageNumber: this.pageNumber, state: 'idle' })
  }

  private renderOcrItems(items: readonly ReaderOcrTextItem[]) {
    const layer = this.textLayer
    if (!layer)
      throw new Error('PDF text layer is not mounted')
    layer.replaceChildren()
    layer.classList.add('reader-pdf-text-layer-ocr')
    for (const item of items) {
      const span = document.createElement('span')
      span.textContent = item.text
      span.style.left = `${item.rect.x * 100}%`
      span.style.top = `${item.rect.y * 100}%`
      span.style.width = `${item.rect.width * 100}%`
      span.style.height = `${item.rect.height * 100}%`
      const itemHeight = Math.max(1, item.rect.height * layer.clientHeight)
      span.style.fontSize = `${itemHeight}px`
      span.style.lineHeight = `${itemHeight}px`
      layer.append(span)
    }
  }

  private async renderOcr(viewport: ReturnType<PDFPageProxy['getViewport']>, generation: number) {
    const provider = this.ocrProvider
    const canvas = this.canvas
    if (!provider || !canvas)
      throw new Error('OCR was requested without a provider or rendered PDF canvas')

    const cached = this.ocrCache.get(this.pageNumber)
    if (cached) {
      this.renderOcrItems(cached.items)
      this.textLayerKind = cached.items.length > 0 ? 'ocr' : 'none'
      this.callbacks.onOcrStatusChange({ pageNumber: this.pageNumber, state: 'ready' })
      return
    }

    const controller = new AbortController()
    this.ocrAbortController = controller
    this.textLayerKind = 'recognizing'
    this.emitState()
    this.callbacks.onOcrStatusChange({ pageNumber: this.pageNumber, state: 'recognizing' })
    try {
      const image = await canvasBlob(canvas, controller.signal)
      const result = await provider({
        format: 'pdf',
        image,
        pageNumber: this.pageNumber,
        pixelHeight: canvas.height,
        pixelWidth: canvas.width,
        renderedHeight: viewport.height,
        renderedWidth: viewport.width,
        signal: controller.signal,
      })
      if (controller.signal.aborted || generation !== this.renderGeneration || this.destroyed)
        return
      validateOcrResult(result)
      this.ocrCache.set(this.pageNumber, result)
      this.renderOcrItems(result.items)
      this.textLayerKind = result.items.length > 0 ? 'ocr' : 'none'
      this.callbacks.onOcrStatusChange({ pageNumber: this.pageNumber, state: 'ready' })
    }
    catch (error) {
      if (controller.signal.aborted || generation !== this.renderGeneration || this.destroyed)
        return
      this.textLayerKind = 'none'
      const status = { error: toError(error), pageNumber: this.pageNumber, state: 'failed' as const }
      this.callbacks.onOcrStatusChange(status)
    }
    finally {
      if (this.ocrAbortController === controller)
        this.ocrAbortController = null
    }
  }

  private async renderPage(forceOcr: boolean) {
    const visibleCanvas = this.canvas
    const documentProxy = this.document
    const scroller = this.scroller
    const pageSurface = this.pageSurface
    const textLayer = this.textLayer
    const pdfJs = this.pdfJs
    if (this.destroyed || !visibleCanvas || !documentProxy || !scroller || !pageSurface || !textLayer || !pdfJs)
      return

    const generation = ++this.renderGeneration
    this.ocrAbortController?.abort(new DOMException('PDF page rendering restarted', 'AbortError'))
    this.ocrAbortController = null
    this.textLayerTask?.cancel()
    this.textLayerTask = null
    this.renderTask?.cancel()
    this.renderTask = null
    this.page?.cleanup()
    this.textLayerKind = 'none'
    const page = await documentProxy.getPage(this.pageNumber)
    if (this.destroyed || generation !== this.renderGeneration) {
      page.cleanup()
      return
    }
    this.page = page

    const unscaledViewport = page.getViewport({ scale: 1 })
    const availableWidth = Math.max(160, scroller.clientWidth - 48)
    const fitScale = availableWidth / unscaledViewport.width
    const viewport = page.getViewport({ scale: fitScale * this.scale })
    const outputScale = Math.min(window.devicePixelRatio || 1, 2)
    const nextCanvas = document.createElement('canvas')
    nextCanvas.className = 'reader-pdf-canvas'
    nextCanvas.width = Math.floor(viewport.width * outputScale)
    nextCanvas.height = Math.floor(viewport.height * outputScale)
    nextCanvas.style.width = `${Math.floor(viewport.width)}px`
    nextCanvas.style.height = `${Math.floor(viewport.height)}px`
    nextCanvas.setAttribute('aria-label', `Page ${this.pageNumber} of ${documentProxy.numPages}`)

    const renderTask = page.render({
      canvas: nextCanvas,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      viewport,
    })
    this.renderTask = renderTask
    try {
      await renderTask.promise
    }
    catch (error) {
      if (!(error instanceof pdfJs.RenderingCancelledException))
        throw error
    }
    finally {
      if (this.renderTask === renderTask)
        this.renderTask = null
    }
    if (this.destroyed || generation !== this.renderGeneration)
      return

    pageSurface.style.width = `${Math.floor(viewport.width)}px`
    pageSurface.style.height = `${Math.floor(viewport.height)}px`
    pageSurface.style.setProperty('--scale-factor', String(viewport.scale))
    pageSurface.style.setProperty('--total-scale-factor', String(viewport.scale))
    pageSurface.style.setProperty('--scale-round-x', '1px')
    pageSurface.style.setProperty('--scale-round-y', '1px')
    textLayer.replaceChildren()
    visibleCanvas.replaceWith(nextCanvas)
    this.canvas = nextCanvas

    const content = await this.loadTextContent(page)
    if (this.destroyed || generation !== this.renderGeneration)
      return
    if (forceOcr || !hasExtractedText(content)) {
      if (this.ocrProvider) {
        await this.renderOcr(viewport, generation)
      }
      else {
        textLayer.replaceChildren()
        this.textLayerKind = 'none'
        this.callbacks.onOcrStatusChange({ pageNumber: this.pageNumber, state: 'unavailable' })
      }
    }
    else {
      await this.renderEmbeddedText(content, viewport, generation)
    }
    if (this.destroyed || generation !== this.renderGeneration)
      return
    this.renderAnnotations()
    this.emitState()
  }
}

export function openPdfAdapter(
  source: PdfSource,
  initialPosition: ReaderPosition | null | undefined,
  ocrProvider: ReaderOcrProvider | undefined,
  callbacks: ReaderAdapterCallbacks,
): ReaderAdapter {
  return new PdfAdapter(source, initialPosition, ocrProvider, callbacks)
}
