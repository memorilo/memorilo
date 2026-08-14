import type { ReaderAnnotation } from '../../types'
import type {
  ReaderAdapterCallbacks,
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import {
  combineLifecycleFailures,
  runSyncLifecycleOperations,
} from '@memorilo/effect-lifecycle'
import { AnnotationActivationOwner, annotationOverlayTint } from '../annotations'
import { FixedPageViewportController } from '../fixed-page/viewport'
import { RegionSelectionController } from '../region-selection'

export type ComicFormat = 'cbr' | 'cbz'

export interface ComicPageSurfaceOptions {
  callbacks: Pick<
    ReaderAdapterCallbacks,
    | 'onAnnotationActivate'
    | 'onError'
    | 'onRegionSelectionModeChange'
    | 'regionAnnotationLabel'
  >
  format: ComicFormat
  onRegionSelection: (selection: RegionSelectionResult | null) => void
}

interface ComicPageDom {
  annotationLayer: HTMLDivElement
  content: HTMLDivElement
}

function configureImage(image: HTMLImageElement): void {
  image.alt = ''
  image.decoding = 'async'
  Object.assign(image.style, {
    display: 'block',
    height: '100%',
    objectFit: 'contain',
    userSelect: 'none',
    width: '100%',
  })
}

function createPageDom(image: HTMLImageElement): ComicPageDom {
  const content = document.createElement('div')
  Object.assign(content.style, {
    height: '100%',
    position: 'relative',
    width: '100%',
  })
  const annotationLayer = document.createElement('div')
  Object.assign(annotationLayer.style, {
    inset: '0',
    pointerEvents: 'none',
    position: 'absolute',
  })
  content.append(image, annotationLayer)
  return { annotationLayer, content }
}

function closeConstructionResources(
  error: unknown,
  resources: {
    annotationActivation: AnnotationActivationOwner | null
    regionSelection: RegionSelectionController
    resizeObserver: ResizeObserver | null
    scroller: HTMLDivElement
    viewport: FixedPageViewportController | null
  },
): never {
  try {
    runSyncLifecycleOperations([
      () => resources.resizeObserver?.disconnect(),
      () => resources.regionSelection.destroy(),
      () => resources.viewport?.destroy(),
      () => resources.annotationActivation?.close(),
      () => resources.scroller.remove(),
    ], 'Failed to close partially constructed comic page surface')
  }
  catch (cleanupError) {
    throw combineLifecycleFailures(
      [error, cleanupError],
      'Failed to construct and close comic page surface',
    )
  }
  throw error
}

/** Owns every browser resource and committed DOM node for one comic page view. */
export class ComicPageSurface {
  private annotationActivation: AnnotationActivationOwner | null
  private annotationLayer: HTMLDivElement
  private closed = false
  private content: HTMLDivElement
  private currentObjectUrl: string | null = null
  private imageNaturalHeight = 0
  private imageNaturalWidth = 0
  private readonly objectUrls = new Set<string>()
  private pageNumber = 0
  private regionSelection: RegionSelectionController | null
  private resizeObserver: ResizeObserver | null
  private scale = 1
  private readonly scroller: HTMLDivElement
  private scrollerRemoved = false
  private readonly surface: HTMLDivElement
  private viewport: FixedPageViewportController | null

  constructor(
    container: HTMLElement,
    private readonly options: ComicPageSurfaceOptions,
  ) {
    const scroller = document.createElement('div')
    Object.assign(scroller.style, {
      alignItems: 'flex-start',
      background: '#fff',
      boxSizing: 'border-box',
      display: 'flex',
      height: '100%',
      justifyContent: 'flex-start',
      overflow: 'auto',
      padding: '24px',
      width: '100%',
    })
    const surface = document.createElement('div')
    Object.assign(surface.style, {
      flex: '0 0 auto',
      margin: 'auto',
      position: 'relative',
    })
    const initialImage = document.createElement('img')
    configureImage(initialImage)
    const initialPage = createPageDom(initialImage)
    const regionCapture = document.createElement('div')
    regionCapture.setAttribute('aria-hidden', 'true')
    surface.append(initialPage.content, regionCapture)
    scroller.append(surface)

    const regionSelection = new RegionSelectionController({
      onEnabledChange: options.callbacks.onRegionSelectionModeChange,
      onSelection: options.onRegionSelection,
    })
    let annotationActivation: AnnotationActivationOwner | null = null
    let viewport: FixedPageViewportController | null = null
    let resizeObserver: ResizeObserver | null = null
    try {
      annotationActivation = new AnnotationActivationOwner(
        surface,
        annotationId => options.callbacks.onAnnotationActivate({ annotationId }),
      )
      regionSelection.mount(surface, regionCapture)
      viewport = new FixedPageViewportController(scroller)
      resizeObserver = new ResizeObserver(() => {
        if (this.closed)
          return
        try {
          this.#layoutImage()
        }
        catch (error) {
          options.callbacks.onError(error instanceof Error ? error : new Error(String(error)))
        }
      })
      resizeObserver.observe(scroller)
      container.append(scroller)
    }
    catch (error) {
      closeConstructionResources(error, {
        annotationActivation,
        regionSelection,
        resizeObserver,
        scroller,
        viewport,
      })
    }

    this.annotationActivation = annotationActivation
    this.annotationLayer = initialPage.annotationLayer
    this.content = initialPage.content
    this.regionSelection = regionSelection
    this.resizeObserver = resizeObserver
    this.scroller = scroller
    this.surface = surface
    this.viewport = viewport
  }

  close(): void {
    this.closed = true
    const operations: Array<() => void> = [
      () => {
        if (!this.resizeObserver)
          return
        this.resizeObserver?.disconnect()
        this.resizeObserver = null
      },
      () => {
        if (!this.regionSelection)
          return
        this.regionSelection?.destroy()
        this.regionSelection = null
      },
      () => {
        if (!this.viewport)
          return
        this.viewport?.destroy()
        this.viewport = null
      },
      () => {
        if (!this.annotationActivation)
          return
        this.annotationActivation?.close()
        this.annotationActivation = null
      },
      ...[...this.objectUrls].map(objectUrl => () => this.releaseObjectUrl(objectUrl)),
      () => {
        if (this.currentObjectUrl !== null && !this.objectUrls.has(this.currentObjectUrl))
          this.currentObjectUrl = null
      },
      () => {
        if (this.scrollerRemoved)
          return
        this.scroller.remove()
        this.scrollerRemoved = true
      },
    ]
    runSyncLifecycleOperations(operations, 'Failed to close comic page surface')
  }

  commit(
    image: HTMLImageElement,
    objectUrl: string,
    annotations: readonly ReaderAnnotation[],
    pageNumber: number,
    scale: number,
    entryEdge: ReaderPageEdge,
  ): void {
    if (this.closed)
      throw new Error('Comic page surface is closed')
    const nextPage = createPageDom(image)
    nextPage.annotationLayer.append(...this.#annotationMarkers(annotations, pageNumber))
    const previousContent = this.content
    const previousHeight = this.surface.style.height
    const previousWidth = this.surface.style.width
    const nextHeight = image.naturalHeight
    const nextWidth = image.naturalWidth
    let contentReplaced = false
    try {
      this.#applyLayout(nextWidth, nextHeight, scale)
      previousContent.replaceWith(nextPage.content)
      contentReplaced = true
      this.viewport?.positionAtEdge(entryEdge, 'next-frame')
    }
    catch (error) {
      const failures: unknown[] = [error]
      if (contentReplaced) {
        try {
          nextPage.content.replaceWith(previousContent)
        }
        catch (rollbackError) {
          failures.push(rollbackError)
        }
      }
      this.surface.style.height = previousHeight
      this.surface.style.width = previousWidth
      throw combineLifecycleFailures(failures, 'Failed to commit comic page surface')
    }

    const previousObjectUrl = this.currentObjectUrl
    this.annotationLayer = nextPage.annotationLayer
    this.content = nextPage.content
    this.currentObjectUrl = objectUrl
    this.imageNaturalHeight = nextHeight
    this.imageNaturalWidth = nextWidth
    this.pageNumber = pageNumber
    this.scale = scale
    if (previousObjectUrl) {
      try {
        this.releaseObjectUrl(previousObjectUrl)
      }
      catch (error) {
        this.options.callbacks.onError(new Error('Failed to release the previous comic page', { cause: error }))
      }
    }
  }

  createImage(objectUrl: string, pageNumber: number, pageCount: number): HTMLImageElement {
    const image = new Image()
    configureImage(image)
    image.setAttribute('aria-label', `Page ${pageNumber} of ${pageCount}`)
    image.src = objectUrl
    return image
  }

  createObjectUrl(blob: Blob): string {
    if (this.closed)
      throw new Error('Comic page surface is closed')
    const objectUrl = URL.createObjectURL(blob)
    this.objectUrls.add(objectUrl)
    return objectUrl
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    return this.viewport?.move(direction) ?? 'at-boundary'
  }

  releaseObjectUrl(objectUrl: string): void {
    if (!this.objectUrls.has(objectUrl))
      return
    URL.revokeObjectURL(objectUrl)
    this.objectUrls.delete(objectUrl)
  }

  scrollToAnnotation(annotationId: string): void {
    if (this.closed)
      return
    this.annotationLayer
      .querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(annotationId)}"]`)
      ?.scrollIntoView({ block: 'center', inline: 'center' })
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    if (!this.closed) {
      this.annotationLayer.replaceChildren(
        ...this.#annotationMarkers(annotations, this.pageNumber),
      )
    }
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    if (!this.closed)
      this.regionSelection?.setEnabled(enabled)
  }

  setScale(scale: number): void {
    if (this.closed)
      return
    const previousHeight = this.surface.style.height
    const previousWidth = this.surface.style.width
    try {
      this.#applyLayout(this.imageNaturalWidth, this.imageNaturalHeight, scale)
      this.viewport?.positionAtEdge('start', 'next-frame')
      this.scale = scale
    }
    catch (error) {
      this.surface.style.height = previousHeight
      this.surface.style.width = previousWidth
      throw error
    }
  }

  #annotationMarkers(
    annotations: readonly ReaderAnnotation[],
    pageNumber: number,
  ): HTMLButtonElement[] {
    return annotations.flatMap((annotation): HTMLButtonElement[] => {
      const anchor = annotation.anchor
      if (anchor.format !== this.options.format || anchor.type !== 'region' || anchor.pageNumber !== pageNumber)
        return []
      const marker = document.createElement('button')
      marker.dataset.annotationId = annotation.id
      marker.setAttribute('aria-label', this.options.callbacks.regionAnnotationLabel())
      marker.type = 'button'
      const tint = annotationOverlayTint(annotation.color)
      Object.assign(marker.style, {
        background: tint,
        border: annotation.annotationTopicId === undefined ? '0' : `2px solid ${tint}`,
        cursor: 'pointer',
        height: `${anchor.rect.height * 100}%`,
        left: `${anchor.rect.x * 100}%`,
        padding: '0',
        pointerEvents: 'auto',
        position: 'absolute',
        top: `${anchor.rect.y * 100}%`,
        width: `${anchor.rect.width * 100}%`,
      })
      return [marker]
    })
  }

  #applyLayout(naturalWidth: number, naturalHeight: number, scale: number): void {
    if (naturalWidth <= 0 || naturalHeight <= 0)
      return
    const availableWidth = Math.max(1, this.scroller.clientWidth - 48)
    const availableHeight = Math.max(1, this.scroller.clientHeight - 48)
    const fitScale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight)
    const displayScale = fitScale * scale
    this.surface.style.width = `${Math.max(1, Math.round(naturalWidth * displayScale))}px`
    this.surface.style.height = `${Math.max(1, Math.round(naturalHeight * displayScale))}px`
  }

  #layoutImage(): void {
    this.#applyLayout(this.imageNaturalWidth, this.imageNaturalHeight, this.scale)
  }
}
