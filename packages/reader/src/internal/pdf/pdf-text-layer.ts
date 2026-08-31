import type { PDFPageProxy, TextLayer } from 'pdfjs-dist'
import type {
  ReaderOcrProvider,
  ReaderOcrResult,
  ReaderTextLayerKind,
} from '../../types'
import type { ReaderAdapterCallbacks } from '../reader-adapter'
import { runSyncLifecycleOperations } from '@memorilo/effect-lifecycle'
import { interruptPromise } from '../interrupt-promise'
import { toReaderError } from '../reader-adapter'
import { applyPdfTextLayerContentStyles, pdfLayerClassNames } from './pdf-layer.stylex'
import {
  pdfCanvasBlob,
  projectPdfOcrItems,
  validatePdfOcrResult,
} from './pdf-ocr-projection'
import { projectPdfTextSelection } from './pdf-text-selection'

export interface PdfTextLayerRenderAttempt {
  isCurrent: () => boolean
  signal: AbortSignal
}

export interface PdfTextLayerCommit {
  commit: () => void
}

interface PdfTextLayerRenderInput {
  canvas: HTMLCanvasElement
  forceOcr: boolean
  page: PDFPageProxy
  pageNumber: number
  viewport: ReturnType<PDFPageProxy['getViewport']>
}

interface PdfTextLayerOptions {
  callbacks: ReaderAdapterCallbacks
  layer: HTMLDivElement
  ocrProvider?: ReaderOcrProvider
  onKindChange: (kind: ReaderTextLayerKind) => void
  pageSurface: HTMLDivElement
  TextLayer: typeof TextLayer
}

type PdfTextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>

function hasExtractedText(content: PdfTextContent): boolean {
  return content.items.some(item => 'str' in item && item.str.trim().length > 0)
}

/** Owns embedded/OCR text projection, selection capture, and page-local caches. */
export class PdfTextLayer {
  private closed = false
  private currentKind: ReaderTextLayerKind = 'none'
  private cachesCleared = false
  private kindReset = false
  private layerCleared = false
  private readonly ocrCache = new Map<number, ReaderOcrResult>()
  private readonly textContentCache = new Map<number, PdfTextContent>()
  private task: TextLayer | null = null

  constructor(private readonly options: PdfTextLayerOptions) {}

  cancel(): void {
    this.cancelPending()
  }

  private cancelPending(): void {
    this.task?.cancel()
    this.task = null
  }

  captureSelection(pageNumber: number): void {
    if (this.closed)
      return
    try {
      this.publishSelection(pageNumber)
    }
    catch (error) {
      this.options.callbacks.onError(toReaderError(error))
    }
  }

  close(): void {
    this.closed = true
    runSyncLifecycleOperations([
      () => this.cancelPending(),
      () => {
        if (this.layerCleared)
          return
        this.options.layer.replaceChildren()
        this.layerCleared = true
      },
      () => {
        if (this.kindReset)
          return
        this.setKind('none')
        this.kindReset = true
      },
      () => {
        if (this.cachesCleared)
          return
        this.ocrCache.clear()
        this.textContentCache.clear()
        this.cachesCleared = true
      },
    ], 'Failed to close PDF text layer')
  }

  async render(
    input: PdfTextLayerRenderInput,
    attempt: PdfTextLayerRenderAttempt,
  ): Promise<PdfTextLayerCommit | null> {
    if (this.closed || !attempt.isCurrent())
      return null
    this.cancelPending()
    const content = await this.loadTextContent(input.page, input.pageNumber, attempt)
    if (!content || this.closed || !attempt.isCurrent())
      return null

    if (input.forceOcr || !hasExtractedText(content)) {
      if (!this.options.ocrProvider) {
        return this.prepareCommit(this.createStagingLayer(), 'none', () => {
          this.options.callbacks.onOcrStatusChange({
            pageNumber: input.pageNumber,
            state: 'unavailable',
          })
        })
      }
      if (input.forceOcr)
        this.ocrCache.delete(input.pageNumber)
      return this.renderOcr(input, attempt)
    }

    return this.renderEmbeddedText(content, input.viewport, attempt, input.pageNumber)
  }

  private createStagingLayer(): HTMLDivElement {
    const staging = this.options.layer.cloneNode(false) as HTMLDivElement
    staging.replaceChildren()
    return staging
  }

  private prepareCommit(
    staging: HTMLDivElement,
    kind: ReaderTextLayerKind,
    afterCommit?: () => void,
  ): PdfTextLayerCommit {
    return {
      commit: () => {
        this.options.layer.className = staging.className
        this.options.layer.replaceChildren(...staging.childNodes)
        this.setKind(kind)
        afterCommit?.()
      },
    }
  }

  private async loadTextContent(
    page: PDFPageProxy,
    pageNumber: number,
    attempt: PdfTextLayerRenderAttempt,
  ): Promise<PdfTextContent | null> {
    const cached = this.textContentCache.get(pageNumber)
    if (cached)
      return cached
    try {
      const content = await interruptPromise(
        page.getTextContent({ disableNormalization: true, includeMarkedContent: true }),
        attempt.signal,
      )
      if (this.closed || !attempt.isCurrent())
        return null
      this.textContentCache.set(pageNumber, content)
      return content
    }
    catch (error) {
      if (this.closed || !attempt.isCurrent())
        return null
      throw error
    }
  }

  private publishSelection(pageNumber: number): void {
    const projection = projectPdfTextSelection({
      kind: this.currentKind,
      layer: this.options.layer,
      pageNumber,
      pageSurface: this.options.pageSurface,
    })
    if (projection.status === 'owned')
      this.options.callbacks.onSelectionChange(projection.selection)
  }

  private async renderEmbeddedText(
    content: PdfTextContent,
    viewport: ReturnType<PDFPageProxy['getViewport']>,
    attempt: PdfTextLayerRenderAttempt,
    pageNumber: number,
  ): Promise<PdfTextLayerCommit | null> {
    const layer = this.createStagingLayer()
    layer.replaceChildren()
    layer.className = `reader-pdf-text-layer ${pdfLayerClassNames.textLayer}`
    const textLayer = new this.options.TextLayer({
      container: layer,
      textContentSource: content,
      viewport,
    })
    this.task = textLayer
    try {
      await interruptPromise(textLayer.render(), attempt.signal)
      applyPdfTextLayerContentStyles(layer, false)
    }
    catch (error) {
      if (attempt.isCurrent() && !this.closed)
        throw error
      return null
    }
    finally {
      if (this.task === textLayer)
        this.task = null
    }
    if (!attempt.isCurrent() || this.closed)
      return null
    return this.prepareCommit(layer, 'embedded', () => {
      this.options.callbacks.onOcrStatusChange({ pageNumber, state: 'idle' })
    })
  }

  private async renderOcr(
    input: PdfTextLayerRenderInput,
    attempt: PdfTextLayerRenderAttempt,
  ): Promise<PdfTextLayerCommit | null> {
    const provider = this.options.ocrProvider
    if (!provider)
      throw new Error('OCR was requested without a provider')

    const cached = this.ocrCache.get(input.pageNumber)
    if (cached) {
      const layer = this.createStagingLayer()
      projectPdfOcrItems(layer, cached.items, input.viewport.height)
      applyPdfTextLayerContentStyles(layer, true)
      return this.prepareCommit(layer, cached.items.length > 0 ? 'ocr' : 'none', () => {
        this.options.callbacks.onOcrStatusChange({ pageNumber: input.pageNumber, state: 'ready' })
      })
    }

    this.options.callbacks.onOcrStatusChange({ pageNumber: input.pageNumber, state: 'recognizing' })
    try {
      const image = await pdfCanvasBlob(input.canvas, attempt.signal)
      const result = await interruptPromise(
        provider({
          format: 'pdf',
          image,
          pageNumber: input.pageNumber,
          pixelHeight: input.canvas.height,
          pixelWidth: input.canvas.width,
          renderedHeight: input.viewport.height,
          renderedWidth: input.viewport.width,
          signal: attempt.signal,
        }),
        attempt.signal,
      )
      if (!attempt.isCurrent() || this.closed)
        return null
      validatePdfOcrResult(result)
      this.ocrCache.set(input.pageNumber, result)
      const layer = this.createStagingLayer()
      projectPdfOcrItems(layer, result.items, input.viewport.height)
      applyPdfTextLayerContentStyles(layer, true)
      return this.prepareCommit(layer, result.items.length > 0 ? 'ocr' : 'none', () => {
        this.options.callbacks.onOcrStatusChange({ pageNumber: input.pageNumber, state: 'ready' })
      })
    }
    catch (error) {
      if (attempt.signal.aborted || !attempt.isCurrent() || this.closed)
        return null
      this.options.callbacks.onOcrStatusChange({
        error: toReaderError(error),
        pageNumber: input.pageNumber,
        state: 'failed',
      })
      return this.prepareCommit(this.createStagingLayer(), 'none')
    }
  }

  private setKind(kind: ReaderTextLayerKind): void {
    const changed = kind !== this.currentKind
    this.currentKind = kind
    if (changed)
      this.options.onKindChange(kind)
  }
}
