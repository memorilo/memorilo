import type { RegionSelectionResult } from '../region-selection'
import type { EpubRegionMarker } from './epub-region-projection'
import {
  combineLifecycleFailures,
  runSyncLifecycleOperations,
} from '@memorilo/effect-lifecycle'
import { AnnotationActivationOwner, annotationOverlayTint } from '../annotations'
import { RegionSelectionController } from '../region-selection'
import { regionSelectionClassNames } from '../region-selection.stylex'
import { epubLayerClassNames } from './epub-layer.stylex'

interface EpubReaderSurfaceOptions {
  container: HTMLElement
  onAnnotationActivate: (annotationId: string) => void
  onRegionSelection: (selection: RegionSelectionResult | null) => void
  onRegionSelectionModeChange: (enabled: boolean) => void
  onResize: () => void
  title: string
}

/** Owns the EPUB navigator surface, overlay DOM, and browser observers. */
export class EpubReaderSurface {
  readonly element: HTMLDivElement

  #annotationActivation: AnnotationActivationOwner | null = null
  readonly #annotationLayer: HTMLDivElement
  #closing = false
  #elementRemoved = false
  #regionSelection: RegionSelectionController | null = null
  #resizeObserver: ResizeObserver | null = null

  constructor({
    container,
    onAnnotationActivate,
    onRegionSelection,
    onRegionSelectionModeChange,
    onResize,
    title,
  }: EpubReaderSurfaceOptions) {
    this.element = document.createElement('div')
    this.element.setAttribute('role', 'document')
    this.element.setAttribute('aria-label', title)
    Object.assign(this.element.style, {
      background: '#fff',
      height: '100%',
      margin: '0 auto',
      maxWidth: '100%',
      overflow: 'hidden',
      position: 'relative',
      width: '100%',
    })
    this.#annotationLayer = document.createElement('div')
    this.#annotationLayer.className = regionSelectionClassNames.annotations
    const regionCapture = document.createElement('div')
    regionCapture.setAttribute('aria-hidden', 'true')
    this.element.append(this.#annotationLayer, regionCapture)

    const regionSelection = new RegionSelectionController({
      onEnabledChange: onRegionSelectionModeChange,
      onSelection: onRegionSelection,
    })
    let annotationActivation: AnnotationActivationOwner | null = null
    let resizeObserver: ResizeObserver | null = null
    try {
      annotationActivation = new AnnotationActivationOwner(
        this.#annotationLayer,
        onAnnotationActivate,
      )
      regionSelection.mount(this.element, regionCapture)
      resizeObserver = new ResizeObserver(() => {
        if (!this.#closing)
          onResize()
      })
      container.append(this.element)
    }
    catch (error) {
      try {
        runSyncLifecycleOperations([
          () => resizeObserver?.disconnect(),
          () => regionSelection.destroy(),
          () => annotationActivation?.close(),
          () => this.element.remove(),
        ], 'Failed to close partially constructed EPUB reader surface')
      }
      catch (cleanupError) {
        throw combineLifecycleFailures(
          [error, cleanupError],
          'Failed to construct and close EPUB reader surface',
        )
      }
      throw error
    }
    this.#annotationActivation = annotationActivation
    this.#regionSelection = regionSelection
    this.#resizeObserver = resizeObserver
  }

  clearFrameSelections(): void {
    for (const frame of this.element.querySelectorAll('iframe'))
      frame.contentWindow?.getSelection()?.removeAllRanges()
  }

  close(): void {
    this.#closing = true
    runSyncLifecycleOperations([
      () => {
        if (!this.#resizeObserver)
          return
        this.#resizeObserver.disconnect()
        this.#resizeObserver = null
      },
      () => {
        if (!this.#regionSelection)
          return
        this.#regionSelection.destroy()
        this.#regionSelection = null
      },
      () => {
        if (!this.#annotationActivation)
          return
        this.#annotationActivation.close()
        this.#annotationActivation = null
      },
      () => {
        if (this.#elementRemoved)
          return
        this.element.remove()
        this.#elementRemoved = true
      },
    ], 'Failed to close EPUB reader surface')
  }

  observeResize(): void {
    if (!this.#closing)
      this.#resizeObserver?.observe(this.element)
  }

  styleNavigatorFrame(frame: Element | null): void {
    if (frame)
      frame.className = epubLayerClassNames.navigatorFrame
  }

  renderRegionMarkers(markers: readonly EpubRegionMarker[], label: () => string): void {
    this.#annotationLayer.replaceChildren()
    for (const projected of markers) {
      const marker = document.createElement('button')
      marker.className = regionSelectionClassNames.annotation
      marker.dataset.annotationId = projected.annotationId
      marker.setAttribute('aria-label', label())
      marker.type = 'button'
      marker.style.backgroundColor = annotationOverlayTint(projected.color)
      marker.style.height = `${projected.height}px`
      marker.style.left = `${projected.left}px`
      marker.style.top = `${projected.top}px`
      marker.style.width = `${projected.width}px`
      this.#annotationLayer.append(marker)
    }
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    this.#regionSelection?.setEnabled(enabled)
  }
}
