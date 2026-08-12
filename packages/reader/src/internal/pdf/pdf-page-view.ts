import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
  TextLayer,
} from 'pdfjs-dist'
import type {
  ReaderAnnotation,
  ReaderNormalizedRect,
  ReaderOcrProvider,
  ReaderTextLayerKind,
} from '../../types'
import type { ReaderAdapterCallbacks } from '../reader-adapter'
import type { PdfTextLayerRenderAttempt } from './pdf-text-layer'
import {
  createLatestOperationSupervisor,
  createResourceScope,
  runSyncLifecycleOperations,
} from '@memorilo/effect-lifecycle'
import { AnnotationActivationOwner, annotationOverlayTint } from '../annotations'
import { clampUnit } from '../fixed-page/geometry'
import { interruptPromise } from '../interrupt-promise'
import { PdfTextLayer } from './pdf-text-layer'

export interface PdfJsModule {
  AbortException: typeof import('pdfjs-dist').AbortException
  PDFDataRangeTransport: typeof import('pdfjs-dist').PDFDataRangeTransport
  PDFWorker: typeof import('pdfjs-dist').PDFWorker
  RenderingCancelledException: typeof import('pdfjs-dist').RenderingCancelledException
  TextLayer: typeof TextLayer
  getDocument: typeof import('pdfjs-dist').getDocument
}

export interface PdfPageRenderInput {
  availableWidth: number
  forceOcr: boolean
  pageNumber: number
  scale: number
}

interface PdfPageViewOptions {
  annotationLayer: HTMLDivElement
  callbacks: ReaderAdapterCallbacks
  canvas: HTMLCanvasElement
  document: PDFDocumentProxy
  ocrProvider?: ReaderOcrProvider
  onTextLayerKindChange: (kind: ReaderTextLayerKind) => void
  pageSurface: HTMLDivElement
  pdfJs: PdfJsModule
  textLayer: HTMLDivElement
}

function annotationRects(annotation: ReaderAnnotation): readonly ReaderNormalizedRect[] {
  if (annotation.anchor.format !== 'pdf')
    return []
  return annotation.anchor.type === 'region' ? [annotation.anchor.rect] : annotation.anchor.rects
}

export class PdfPageView {
  private readonly annotationActivation: AnnotationActivationOwner
  private annotations: readonly ReaderAnnotation[] = []
  private canvas: HTMLCanvasElement
  private currentPage: PDFPageProxy | null = null
  private readonly renders = createLatestOperationSupervisor<'page'>('PDF page rendering', {
    concurrency: 'parallel',
    shutdown: 'interrupt',
  })

  private renderTask: RenderTask | null = null
  private readonly resources = createResourceScope('PDF page view')
  private readonly text: PdfTextLayer

  constructor(private readonly options: PdfPageViewOptions) {
    this.canvas = options.canvas
    this.annotationActivation = new AnnotationActivationOwner(
      options.annotationLayer,
      annotationId => options.callbacks.onAnnotationActivate({ annotationId }),
    )
    this.text = new PdfTextLayer({
      callbacks: options.callbacks,
      layer: options.textLayer,
      ocrProvider: options.ocrProvider,
      onKindChange: options.onTextLayerKindChange,
      pageSurface: options.pageSurface,
      TextLayer: options.pdfJs.TextLayer,
    })
    this.resources.own({
      close: () => {
        this.renders.invalidate('page')
        this.cancelActiveTasks()
      },
      name: 'active rendering tasks',
    })
    this.resources.own({ close: () => this.renders.close(), name: 'render operations' })
    this.resources.own({ close: () => this.releaseCurrentPage(), name: 'current PDF page' })
    this.resources.own({ close: () => this.text.close(), name: 'text layer' })
    this.resources.own({ close: () => this.annotationActivation.close(), name: 'annotation activation' })
    this.resources.commit()
  }

  captureTextSelection(pageNumber: number): void {
    this.text.captureSelection(pageNumber)
  }

  cancel(_reason: unknown = new Error('PDF page rendering cancelled')): void {
    this.renders.invalidate('page')
    this.releaseActiveProjection()
  }

  close(): Promise<void> {
    this.annotations = []
    return this.resources.close()
  }

  render(input: PdfPageRenderInput): Promise<boolean> {
    if (this.resources.isClosed())
      return Promise.resolve(false)
    return this.renders.run('page', attempt => this.renderPage(input, attempt)).then(
      result => result.status === 'current' && result.value,
    )
  }

  private async renderPage(
    input: PdfPageRenderInput,
    attempt: PdfTextLayerRenderAttempt,
  ): Promise<boolean> {
    this.releaseActiveProjection()

    const page = await this.acquirePage(input.pageNumber, attempt)
    if (!page)
      return false
    this.currentPage = page

    const unscaledViewport = page.getViewport({ scale: 1 })
    const fitScale = input.availableWidth / unscaledViewport.width
    const viewport = page.getViewport({ scale: fitScale * input.scale })
    const outputScale = Math.min(window.devicePixelRatio || 1, 2)
    const nextCanvas = document.createElement('canvas')
    nextCanvas.className = 'reader-pdf-canvas'
    nextCanvas.width = Math.floor(viewport.width * outputScale)
    nextCanvas.height = Math.floor(viewport.height * outputScale)
    nextCanvas.style.width = `${Math.floor(viewport.width)}px`
    nextCanvas.style.height = `${Math.floor(viewport.height)}px`
    nextCanvas.setAttribute('aria-label', `Page ${input.pageNumber} of ${this.options.document.numPages}`)

    const renderTask = page.render({
      canvas: nextCanvas,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      viewport,
    })
    this.renderTask = renderTask
    try {
      await interruptPromise(renderTask.promise, attempt.signal)
    }
    catch (error) {
      if (!(error instanceof this.options.pdfJs.RenderingCancelledException) && attempt.isCurrent() && !this.resources.isClosed())
        throw error
    }
    finally {
      if (this.renderTask === renderTask)
        this.renderTask = null
    }
    if (this.resources.isClosed() || !attempt.isCurrent())
      return false

    const textLayerCommit = await this.text.render({
      canvas: nextCanvas,
      forceOcr: input.forceOcr,
      page,
      pageNumber: input.pageNumber,
      viewport,
    }, attempt)
    if (!textLayerCommit || this.resources.isClosed() || !attempt.isCurrent())
      return false
    const annotationElements = this.prepareAnnotations(input.pageNumber)
    if (this.resources.isClosed() || !attempt.isCurrent())
      return false

    const { pageSurface } = this.options
    pageSurface.style.width = `${Math.floor(viewport.width)}px`
    pageSurface.style.height = `${Math.floor(viewport.height)}px`
    pageSurface.style.setProperty('--scale-factor', String(viewport.scale))
    pageSurface.style.setProperty('--total-scale-factor', String(viewport.scale))
    pageSurface.style.setProperty('--scale-round-x', '1px')
    pageSurface.style.setProperty('--scale-round-y', '1px')
    this.canvas.replaceWith(nextCanvas)
    this.canvas = nextCanvas
    textLayerCommit.commit()
    this.options.annotationLayer.replaceChildren(...annotationElements)
    return true
  }

  setAnnotations(annotations: readonly ReaderAnnotation[], pageNumber: number): void {
    if (this.resources.isClosed())
      return
    const previousAnnotations = this.annotations
    this.annotations = annotations
    try {
      const elements = this.prepareAnnotations(pageNumber)
      this.options.annotationLayer.replaceChildren(...elements)
    }
    catch (error) {
      this.annotations = previousAnnotations
      throw error
    }
  }

  private cancelActiveTasks(): void {
    const renderTask = this.renderTask
    runSyncLifecycleOperations([
      () => this.text.cancel(),
      () => {
        if (!renderTask)
          return
        renderTask.cancel()
        if (this.renderTask === renderTask)
          this.renderTask = null
      },
    ], 'Failed to cancel PDF page rendering')
  }

  private releaseActiveProjection(): void {
    runSyncLifecycleOperations([
      () => this.cancelActiveTasks(),
      () => this.releaseCurrentPage(),
    ], 'Failed to release the active PDF page projection')
  }

  private releaseCurrentPage(): void {
    const page = this.currentPage
    if (!page)
      return
    page.cleanup()
    if (this.currentPage === page)
      this.currentPage = null
  }

  private async acquirePage(
    pageNumber: number,
    attempt: PdfTextLayerRenderAttempt,
  ): Promise<PDFPageProxy | null> {
    const acquisition = this.options.document.getPage(pageNumber)
    try {
      const page = await interruptPromise(acquisition, attempt.signal)
      if (this.resources.isClosed() || !attempt.isCurrent()) {
        page.cleanup()
        return null
      }
      return page
    }
    catch (error) {
      if (!this.resources.isClosed() && attempt.isCurrent())
        throw error
      // PDF.js page acquisition cannot be cancelled. Keep the render owned
      // until the late page has arrived and been released so close truly drains.
      await acquisition.then(page => page.cleanup(), () => undefined)
      return null
    }
  }

  private prepareAnnotations(pageNumber: number): HTMLElement[] {
    const elements: HTMLElement[] = []
    for (const annotation of this.annotations) {
      if (annotation.anchor.format !== 'pdf' || annotation.anchor.pageNumber !== pageNumber)
        continue
      const rects = annotationRects(annotation)
      for (const rect of rects) {
        const highlight = document.createElement('div')
        highlight.className = 'reader-pdf-annotation'
        highlight.dataset.kind = annotation.kind
        highlight.style.backgroundColor = annotationOverlayTint(annotation.color)
        highlight.style.left = `${rect.x * 100}%`
        highlight.style.top = `${rect.y * 100}%`
        highlight.style.width = `${rect.width * 100}%`
        highlight.style.height = `${rect.height * 100}%`
        elements.push(highlight)
      }
      if (annotation.kind === 'annotation') {
        const firstRect = rects[0]
        if (!firstRect)
          throw new Error(`PDF annotation ${annotation.id} has no visible anchor rectangle`)
        const marker = document.createElement('button')
        marker.className = 'reader-pdf-note-marker'
        marker.dataset.annotationId = annotation.id
        marker.setAttribute('aria-label', this.options.callbacks.regionAnnotationLabel())
        marker.style.left = `${clampUnit(firstRect.x + firstRect.width) * 100}%`
        marker.style.top = `${firstRect.y * 100}%`
        marker.type = 'button'
        elements.push(marker)
      }
    }
    return elements
  }
}
