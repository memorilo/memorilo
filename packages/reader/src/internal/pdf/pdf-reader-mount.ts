import type { PDFDocumentProxy } from 'pdfjs-dist'
import type {
  ReaderAnnotation,
  ReaderOcrProvider,
  ReaderTextLayerKind,
} from '../../types'
import type {
  ReaderAdapterCallbacks,
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import type { ResolvedReaderSource } from '../source'
import type { PdfOutlineNode } from './pdf-outline-navigation'
import { createResourceScope } from '@memorilo/effect-lifecycle'
import { interruptPromise } from '../interrupt-promise'
import { openPdfDocumentSession } from './pdf-document-session'
import { PdfOutlineNavigation } from './pdf-outline-navigation'
import { PdfPageView } from './pdf-page-view'
import { PdfReaderSurface } from './pdf-reader-surface'

export type PdfSource = ResolvedReaderSource & { format: 'pdf' }

interface OpenPdfReaderMountOptions {
  annotations: readonly ReaderAnnotation[]
  callbacks: ReaderAdapterCallbacks
  container: HTMLElement
  initialPageNumber: number
  ocrProvider?: ReaderOcrProvider
  onRegionSelection: (selection: RegionSelectionResult | null) => void
  onResize: () => void
  onTextLayerKindChange: (kind: ReaderTextLayerKind) => void
  onTextSelection: () => void
  scale: number
  signal: AbortSignal
  source: PdfSource
}

interface PdfMountRenderInput {
  forceOcr: boolean
  pageNumber: number
  scale: number
  signal: AbortSignal
}

interface PdfCommittedLayout {
  availableWidth: number
  pageNumber: number
  scale: number
}

function isSameLayout(left: PdfCommittedLayout, right: PdfCommittedLayout): boolean {
  return left.availableWidth === right.availableWidth
    && left.pageNumber === right.pageNumber
    && left.scale === right.scale
}

export class PdfReaderMount {
  private committedLayout: PdfCommittedLayout | null = null

  private constructor(
    private readonly resources: ReturnType<typeof createResourceScope>,
    private readonly pageView: PdfPageView,
    private readonly surface: PdfReaderSurface,
    private readonly outline: PdfOutlineNavigation,
    private readonly document: PDFDocumentProxy,
    readonly initialPageNumber: number,
    readonly numPages: number,
  ) {}

  static async open(options: OpenPdfReaderMountOptions): Promise<PdfReaderMount> {
    const resources = createResourceScope('PDF reader mount')
    try {
      const surface = (await resources.acquire({
        acquire: () => new PdfReaderSurface({
          container: options.container,
          name: options.source.name,
          onRegionSelection: options.onRegionSelection,
          onRegionSelectionModeChange: enabled => options.callbacks.onRegionSelectionModeChange(enabled),
          onResize: options.onResize,
          onTextSelection: options.onTextSelection,
          pageNumber: options.initialPageNumber,
        }),
        close: owned => owned.close(),
        name: 'reader surface',
      })).resource

      const documentSession = (await resources.acquire({
        acquire: () => openPdfDocumentSession({
          onError: options.callbacks.onError,
          signal: options.signal,
          source: options.source,
        }),
        close: owned => owned.close(),
        name: 'PDF document session',
      })).resource
      const { document, pdfJs } = documentSession
      options.signal.throwIfAborted()

      const pageNumber = Math.min(options.initialPageNumber, document.numPages)
      const outline = new PdfOutlineNavigation()
      outline.load(await interruptPromise(
        document.getOutline() as Promise<PdfOutlineNode[] | null>,
        options.signal,
      ))
      options.signal.throwIfAborted()

      const pageView = (await resources.acquire({
        acquire: () => new PdfPageView({
          annotationLayer: surface.annotationLayer,
          callbacks: options.callbacks,
          canvas: surface.canvas,
          document,
          ocrProvider: options.ocrProvider,
          onTextLayerKindChange: options.onTextLayerKindChange,
          pageSurface: surface.pageSurface,
          pdfJs,
          textLayer: surface.textLayer,
        }),
        close: owned => owned.close(),
        name: 'PDF page view',
      })).resource
      pageView.setAnnotations(options.annotations, pageNumber)

      const mount = new PdfReaderMount(
        resources,
        pageView,
        surface,
        outline,
        document,
        pageNumber,
        document.numPages,
      )
      if (!await mount.render({
        forceOcr: false,
        pageNumber,
        scale: options.scale,
        signal: options.signal,
      })) {
        throw new Error('PDF initial page rendering did not complete')
      }
      surface.observeResize()
      resources.commit()
      return mount
    }
    catch (error) {
      return resources.rollback(error)
    }
  }

  captureTextSelection(pageNumber: number): void {
    this.pageView.captureTextSelection(pageNumber)
  }

  close(): Promise<void> {
    return this.resources.close()
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    return this.surface.moveViewport(direction)
  }

  get outlineItems() {
    return this.outline.items
  }

  pageNumberForOutline(outlineItemId: string, signal: AbortSignal): Promise<number> {
    return interruptPromise(this.outline.pageNumber(outlineItemId, this.document), signal)
  }

  positionAtEdge(edge: ReaderPageEdge): void {
    this.surface.positionAtEdge(edge)
  }

  render(input: PdfMountRenderInput): Promise<boolean> {
    return this.renderAtWidth(this.surface.availablePageWidth(), input)
  }

  renderCurrentLayout(
    pageNumber: number,
    scale: number,
    signal: AbortSignal,
  ): Promise<boolean> {
    const availableWidth = this.surface.availablePageWidth()
    const layout = { availableWidth, pageNumber, scale }
    if (this.committedLayout && isSameLayout(layout, this.committedLayout))
      return Promise.resolve(false)
    return this.renderAtWidth(availableWidth, {
      forceOcr: false,
      pageNumber,
      scale,
      signal,
    })
  }

  scrollAnnotationIntoView(annotationId: string): void {
    this.pageView.scrollAnnotationIntoView(annotationId)
  }

  setAnnotations(annotations: readonly ReaderAnnotation[], pageNumber: number): void {
    this.pageView.setAnnotations(annotations, pageNumber)
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    this.surface.setRegionSelectionEnabled(enabled)
  }

  private async renderAtWidth(
    availableWidth: number,
    input: PdfMountRenderInput,
  ): Promise<boolean> {
    if (this.resources.isClosed())
      return false
    const cancelRender = () => this.pageView.cancel(input.signal.reason)
    input.signal.addEventListener('abort', cancelRender, { once: true })
    try {
      const rendered = await interruptPromise(
        this.pageView.render({
          availableWidth,
          forceOcr: input.forceOcr,
          pageNumber: input.pageNumber,
          scale: input.scale,
        }),
        input.signal,
      )
      if (rendered && !this.resources.isClosed()) {
        this.committedLayout = {
          availableWidth,
          pageNumber: input.pageNumber,
          scale: input.scale,
        }
      }
      return rendered && !this.resources.isClosed()
    }
    finally {
      input.signal.removeEventListener('abort', cancelRender)
    }
  }
}
