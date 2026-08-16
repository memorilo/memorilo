import type { PDFDocumentProxy } from 'pdfjs-dist'
import type {
  ReaderAnnotation,
  ReaderOcrProvider,
  ReaderTextLayerKind,
} from '../../types'
import type { ReaderAdapterCallbacks } from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import type { PdfJsModule } from './pdf-page-view'
import { interruptPromise } from '../interrupt-promise'
import { RegionSelectionController } from '../region-selection'
import { PdfPageView } from './pdf-page-view'

export interface PdfContinuousPage {
  close: () => Promise<void>
  readonly kind: ReaderTextLayerKind
  pageNumber: number
  pageSurface: HTMLDivElement
  regionSelection: RegionSelectionController
  render: (
    forceOcr: boolean,
    availableWidth: number,
    scale: number,
    signal: AbortSignal,
  ) => Promise<boolean>
  setAnnotations: (annotations: readonly ReaderAnnotation[]) => void
  textLayer: HTMLDivElement
}

interface CreatePdfContinuousPageOptions {
  annotations: readonly ReaderAnnotation[]
  callbacks: ReaderAdapterCallbacks
  document: PDFDocumentProxy
  ocrProvider?: ReaderOcrProvider
  onPositionChange: (kind: ReaderTextLayerKind) => void
  onRegionSelection: (result: RegionSelectionResult | null) => void
  onRegionSelectionEnabledChange: (enabled: boolean) => void
  onTextSelection: () => void
  pageNumber: number
  pdfJs: PdfJsModule
  regionSelectionEnabled: boolean
  schedulePosition: () => void
  slot: HTMLDivElement
}

function createPageDom(slot: HTMLElement, pageNumber: number) {
  const ownerDocument = slot.ownerDocument
  const pageSurface = ownerDocument.createElement('div')
  pageSurface.className = 'reader-pdf-page'
  const canvas = ownerDocument.createElement('canvas')
  canvas.className = 'reader-pdf-canvas'
  canvas.setAttribute('aria-label', `Page ${pageNumber}`)
  const annotationLayer = ownerDocument.createElement('div')
  annotationLayer.className = 'reader-pdf-annotations'
  const textLayer = ownerDocument.createElement('div')
  textLayer.className = 'reader-pdf-text-layer'
  const regionCapture = ownerDocument.createElement('div')
  regionCapture.className = 'reader-pdf-region-capture'
  regionCapture.setAttribute('aria-hidden', 'true')
  pageSurface.append(canvas, annotationLayer, textLayer, regionCapture)
  slot.replaceChildren(pageSurface)
  return { annotationLayer, canvas, pageSurface, regionCapture, textLayer }
}

export function createPdfContinuousPage(
  options: CreatePdfContinuousPageOptions,
): PdfContinuousPage {
  const dom = createPageDom(options.slot, options.pageNumber)
  let kind: ReaderTextLayerKind = 'none'
  const regionSelection = new RegionSelectionController({
    onEnabledChange: options.onRegionSelectionEnabledChange,
    onSelection: options.onRegionSelection,
  })
  regionSelection.mount(dom.pageSurface, dom.regionCapture)
  regionSelection.setEnabled(options.regionSelectionEnabled)
  dom.textLayer.addEventListener('pointerup', options.onTextSelection)
  dom.textLayer.addEventListener('keyup', options.onTextSelection)
  const view = new PdfPageView({
    annotationLayer: dom.annotationLayer,
    callbacks: options.callbacks,
    canvas: dom.canvas,
    document: options.document,
    ocrProvider: options.ocrProvider,
    onTextLayerKindChange: (nextKind) => {
      kind = nextKind
      options.onPositionChange(nextKind)
    },
    pageSurface: dom.pageSurface,
    pdfJs: options.pdfJs,
    textLayer: dom.textLayer,
  })
  view.setAnnotations(options.annotations, options.pageNumber)
  const render = async (
    forceOcr: boolean,
    availableWidth: number,
    scale: number,
    signal: AbortSignal,
  ): Promise<boolean> => {
    const cancel = () => view.cancel(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const rendered = await interruptPromise(
        view.render({ availableWidth, forceOcr, pageNumber: options.pageNumber, scale }),
        signal,
      )
      if (rendered) {
        options.slot.style.minHeight = `${dom.pageSurface.offsetHeight}px`
        options.schedulePosition()
      }
      return rendered
    }
    finally {
      signal.removeEventListener('abort', cancel)
    }
  }
  return {
    close: async () => {
      dom.textLayer.removeEventListener('pointerup', options.onTextSelection)
      dom.textLayer.removeEventListener('keyup', options.onTextSelection)
      regionSelection.destroy()
      await view.close()
      dom.pageSurface.remove()
    },
    get kind() {
      return kind
    },
    pageNumber: options.pageNumber,
    pageSurface: dom.pageSurface,
    regionSelection,
    render,
    setAnnotations: annotations => view.setAnnotations(annotations, options.pageNumber),
    textLayer: dom.textLayer,
  }
}
