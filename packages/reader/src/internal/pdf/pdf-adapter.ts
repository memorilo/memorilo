import type {
  ReaderAnnotation,
  ReaderOcrProvider,
  ReaderPosition,
  ReaderTextLayerKind,
} from '../../types'
import type {
  ReaderAdapter,
  ReaderAdapterCallbacks,
  ReaderAdapterState,
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import type { PdfSource } from './pdf-reader-mount'
import {
  combineLifecycleFailures,
  createOperationSupervisor,
  createResourceScope,
} from '@memorilo/effect-lifecycle'
import {
  assertReaderPositionFormat,
  clampReaderScale,
  readerZoomScaleCapability,
  runSingleMount,
  toReaderError,
} from '../reader-adapter'
import { PdfReaderMount } from './pdf-reader-mount'
import './pdf-layer.css'

class PdfAdapter implements ReaderAdapter {
  private annotations: readonly ReaderAnnotation[] = []
  private destroyed = false
  private readonly finalizer = createResourceScope('PDF reader')
  private mounted: PdfReaderMount | null = null
  private readonly mountOperations = createOperationSupervisor('PDF reader mount', { shutdown: 'interrupt' })
  private readonly operations = createOperationSupervisor('PDF reader', { shutdown: 'interrupt' })
  private pageNumber = 1
  private scale = 1
  private textLayerKind: ReaderTextLayerKind = 'none'
  readonly recognizeCurrentPage?: () => Promise<void>

  constructor(
    private readonly source: PdfSource,
    initialPosition: ReaderPosition | null | undefined,
    private readonly ocrProvider: ReaderOcrProvider | undefined,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {
    if (initialPosition !== null && initialPosition !== undefined) {
      assertReaderPositionFormat(initialPosition, 'pdf', 'a PDF reader')
      if (!Number.isSafeInteger(initialPosition.pageNumber) || initialPosition.pageNumber < 1)
        throw new RangeError('PDF reading position must contain a positive page number')
      this.pageNumber = initialPosition.pageNumber
    }
    if (ocrProvider) {
      this.recognizeCurrentPage = () => this.operations.run(async (signal) => {
        if (await this.renderPage(true, this.pageNumber, this.scale, signal))
          this.emitState()
      })
    }
    this.registerFinalizers()
    this.finalizer.commit()
  }

  mount(container: HTMLElement, externalSignal?: AbortSignal): Promise<void> {
    if (this.destroyed)
      return Promise.reject(new Error('Cannot mount a destroyed PDF reader'))
    if (this.mounted)
      return Promise.reject(new Error('PDF reader is already mounted'))
    return runSingleMount(
      this.mountOperations,
      signal => this.mountReader(
        container,
        externalSignal ? AbortSignal.any([signal, externalSignal]) : signal,
      ),
      () => new Error('PDF reader is already mounted'),
    )
  }

  private async mountReader(container: HTMLElement, signal: AbortSignal): Promise<void> {
    const mount = await PdfReaderMount.open({
      annotations: this.annotations,
      callbacks: this.callbacks,
      container,
      initialPageNumber: this.pageNumber,
      ocrProvider: this.ocrProvider,
      onRegionSelection: (selection) => {
        try {
          this.publishRegionSelection(selection)
        }
        catch (error) {
          this.callbacks.onError(toReaderError(error))
        }
      },
      onResize: () => this.renderCurrentLayoutAfterResize(),
      onTextLayerKindChange: (kind) => {
        this.textLayerKind = kind
      },
      onTextSelection: () => this.mounted?.captureTextSelection(this.pageNumber),
      scale: this.scale,
      signal,
      source: this.source,
    })
    try {
      signal.throwIfAborted()
      this.mounted = mount
      this.pageNumber = mount.initialPageNumber
      this.emitState()
    }
    catch (error) {
      if (this.mounted === mount)
        this.mounted = null
      try {
        await mount.close()
      }
      catch (cleanupError) {
        throw combineLifecycleFailures(
          [error, cleanupError],
          'Failed to mount and close PDF reader',
        )
      }
      throw error
    }
  }

  clearSelection() {
    if (this.destroyed)
      return
    this.mounted?.setRegionSelectionEnabled(false)
    document.getSelection()?.removeAllRanges()
    this.callbacks.onSelectionChange(null)
  }

  destroy(): Promise<void> {
    this.destroyed = true
    return this.finalizer.close()
  }

  private registerFinalizers(): void {
    this.finalizer.own({
      close: () => this.mountOperations.close(),
      name: 'mount operations',
    })
    this.finalizer.own({
      close: () => this.operations.close(),
      name: 'reader operations',
    })
    this.finalizer.own({
      close: async () => {
        const mount = this.mounted
        await mount?.close()
        if (this.mounted === mount)
          this.mounted = null
      },
      name: 'PDF reader mount',
    })
  }

  async goBackward(entryEdge: ReaderPageEdge) {
    return this.operations.run(async (signal) => {
      const mount = this.mounted
      if (!mount || this.pageNumber <= 1)
        return
      const nextPageNumber = this.pageNumber - 1
      this.clearSelection()
      if (!await this.renderPage(false, nextPageNumber, this.scale, signal))
        return
      this.pageNumber = nextPageNumber
      mount.positionAtEdge(entryEdge)
      this.emitState()
    })
  }

  async goForward(entryEdge: ReaderPageEdge) {
    return this.operations.run(async (signal) => {
      const mount = this.mounted
      if (!mount || this.pageNumber >= mount.numPages)
        return
      const nextPageNumber = this.pageNumber + 1
      this.clearSelection()
      if (!await this.renderPage(false, nextPageNumber, this.scale, signal))
        return
      this.pageNumber = nextPageNumber
      mount.positionAtEdge(entryEdge)
      this.emitState()
    })
  }

  async goToAnnotation(annotationId: string) {
    return this.operations.run(async (signal) => {
      const annotation = this.annotations.find(item => item.id === annotationId)
      if (!annotation || annotation.anchor.format !== 'pdf')
        throw new Error(`PDF annotation ${annotationId} does not exist`)
      const nextPageNumber = annotation.anchor.pageNumber
      if (nextPageNumber !== this.pageNumber) {
        this.clearSelection()
        if (!await this.renderPage(false, nextPageNumber, this.scale, signal))
          return
        this.pageNumber = nextPageNumber
        this.emitState()
      }
      this.mounted?.scrollPageIntoView()
    })
  }

  async goToOutlineItem(outlineItemId: string) {
    return this.operations.run(async (signal) => {
      const mount = this.mounted
      if (!mount)
        throw new Error(`PDF outline item ${outlineItemId} does not have a document destination`)
      const nextPageNumber = await mount.pageNumberForOutline(outlineItemId, signal)
      this.clearSelection()
      if (!await this.renderPage(false, nextPageNumber, this.scale, signal))
        return
      this.pageNumber = nextPageNumber
      this.emitState()
    })
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    return this.destroyed ? 'at-boundary' : (this.mounted?.moveViewport(direction) ?? 'at-boundary')
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]) {
    if (this.destroyed)
      return
    this.annotations = annotations
    this.mounted?.setAnnotations(annotations, this.pageNumber)
  }

  setRegionSelectionEnabled(enabled: boolean) {
    if (this.destroyed)
      return
    this.mounted?.setRegionSelectionEnabled(enabled)
  }

  async setScale(scale: number) {
    return this.operations.run(async (signal) => {
      const nextScale = clampReaderScale(scale)
      if (nextScale === this.scale)
        return
      this.clearSelection()
      if (!await this.renderPage(false, this.pageNumber, nextScale, signal))
        return
      this.scale = nextScale
      this.emitState()
    })
  }

  private emitState() {
    const total = this.mounted?.numPages ?? 1
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
      outline: this.mounted?.outlineItems ?? [],
      position: { format: 'pdf', pageNumber: this.pageNumber },
      presentationMode: 'publisher',
      scale: this.scale,
      textLayer: this.textLayerKind,
      title: this.source.name,
    }
    this.callbacks.onStateChange(state)
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

  private async renderPage(
    forceOcr: boolean,
    pageNumber: number,
    scale: number,
    signal: AbortSignal,
  ): Promise<boolean> {
    const mount = this.mounted
    if (this.destroyed || !mount)
      return false
    const rendered = await mount.render({ forceOcr, pageNumber, scale, signal })
    return rendered && !this.destroyed && this.mounted === mount
  }

  private renderCurrentLayout(signal: AbortSignal): Promise<boolean> {
    const mount = this.mounted
    if (!mount)
      return Promise.resolve(false)
    return mount.renderCurrentLayout(this.pageNumber, this.scale, signal)
  }

  private renderCurrentLayoutAfterResize(): void {
    if (this.destroyed)
      return
    void this.operations.run(signal => this.renderCurrentLayout(signal)).then(
      (rendered) => {
        if (rendered && !this.destroyed)
          this.emitState()
      },
      (error) => {
        if (!this.destroyed)
          this.callbacks.onError(toReaderError(error))
      },
    )
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
