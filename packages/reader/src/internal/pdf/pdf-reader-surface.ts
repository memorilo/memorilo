import type { ReaderPageEdge, ReaderScrollDirection, ReaderScrollResult } from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import {
  combineLifecycleFailures,
  runSyncLifecycleOperations,
} from '@memorilo/effect-lifecycle'
import { FixedPageViewportController } from '../fixed-page/viewport'
import { RegionSelectionController } from '../region-selection'

interface PdfReaderSurfaceOptions {
  container: HTMLElement
  name: string
  onRegionSelection: (selection: RegionSelectionResult | null) => void
  onRegionSelectionModeChange: (enabled: boolean) => void
  onResize: () => void
  onTextSelection: () => void
  pageNumber: number
}

/** Owns the PDF reader DOM, browser listeners, viewport, and selection layer. */
export class PdfReaderSurface {
  readonly annotationLayer: HTMLDivElement
  readonly canvas: HTMLCanvasElement
  readonly pageSurface: HTMLDivElement
  readonly textLayer: HTMLDivElement

  #domEvents: AbortController | null = new AbortController()
  #closed = false
  readonly #onResize: () => void
  #regionSelection: RegionSelectionController | null
  #resizeObserver: ResizeObserver | null = null
  readonly #scroller: HTMLDivElement
  #scrollerRemoved = false
  #viewport: FixedPageViewportController | null

  constructor({
    container,
    name,
    onRegionSelection,
    onRegionSelectionModeChange,
    onResize,
    onTextSelection,
    pageNumber,
  }: PdfReaderSurfaceOptions) {
    this.#onResize = onResize
    this.#scroller = document.createElement('div')
    this.#scroller.className = 'reader-pdf-scroller'
    this.#scroller.setAttribute('role', 'document')
    this.#scroller.setAttribute('aria-label', name)

    this.pageSurface = document.createElement('div')
    this.pageSurface.className = 'reader-pdf-page'
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'reader-pdf-canvas'
    this.canvas.setAttribute('aria-label', `Page ${pageNumber}`)
    this.annotationLayer = document.createElement('div')
    this.annotationLayer.className = 'reader-pdf-annotations'
    this.textLayer = document.createElement('div')
    this.textLayer.className = 'reader-pdf-text-layer'
    const listenerOptions = { signal: this.#domEvents!.signal }
    this.textLayer.addEventListener(
      'pointerup',
      () => queueMicrotask(onTextSelection),
      listenerOptions,
    )
    this.textLayer.addEventListener(
      'keyup',
      () => queueMicrotask(onTextSelection),
      listenerOptions,
    )
    const regionCapture = document.createElement('div')
    regionCapture.className = 'reader-pdf-region-capture'
    regionCapture.setAttribute('aria-hidden', 'true')

    this.pageSurface.append(this.canvas, this.annotationLayer, this.textLayer, regionCapture)
    this.#scroller.append(this.pageSurface)

    const regionSelection = new RegionSelectionController({
      onEnabledChange: onRegionSelectionModeChange,
      onSelection: onRegionSelection,
    })
    let viewport: FixedPageViewportController | null = null
    try {
      regionSelection.mount(this.pageSurface, regionCapture)
      viewport = new FixedPageViewportController(this.#scroller)
      container.append(this.#scroller)
    }
    catch (error) {
      try {
        runSyncLifecycleOperations([
          () => this.#domEvents?.abort(),
          () => regionSelection.destroy(),
          () => viewport?.destroy(),
          () => this.#scroller.remove(),
        ], 'Failed to close partially constructed PDF reader surface')
      }
      catch (cleanupError) {
        throw combineLifecycleFailures(
          [error, cleanupError],
          'Failed to construct and close PDF reader surface',
        )
      }
      throw error
    }
    this.#regionSelection = regionSelection
    this.#viewport = viewport
  }

  availablePageWidth(): number {
    return Math.max(160, this.#scroller.clientWidth - 48)
  }

  close(): void {
    this.#closed = true
    runSyncLifecycleOperations([
      () => {
        if (!this.#resizeObserver)
          return
        this.#resizeObserver?.disconnect()
        this.#resizeObserver = null
      },
      () => {
        if (!this.#domEvents)
          return
        this.#domEvents?.abort()
        this.#domEvents = null
      },
      () => {
        if (!this.#regionSelection)
          return
        this.#regionSelection?.destroy()
        this.#regionSelection = null
      },
      () => {
        if (!this.#viewport)
          return
        this.#viewport?.destroy()
        this.#viewport = null
      },
      () => {
        if (this.#scrollerRemoved)
          return
        this.#scroller.remove()
        this.#scrollerRemoved = true
      },
    ], 'Failed to close PDF reader surface')
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    return this.#viewport?.move(direction) ?? 'at-boundary'
  }

  observeResize(): void {
    if (this.#closed || this.#resizeObserver)
      return
    this.#resizeObserver = new ResizeObserver(() => {
      if (!this.#closed)
        this.#onResize()
    })
    this.#resizeObserver.observe(this.#scroller)
  }

  positionAtEdge(edge: ReaderPageEdge): void {
    this.#viewport?.positionAtEdge(edge)
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    this.#regionSelection?.setEnabled(enabled)
  }
}
