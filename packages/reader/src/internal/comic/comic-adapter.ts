import type {
  ReaderAnnotation,
  ReaderComicRegionAnchor,
  ReaderOutlineItem,
} from '../../types'
import type { FixedPageRegionSelectionResult } from '../fixed-page/region-selection'
import type {
  ReaderAdapter,
  ReaderAdapterCallbacks,
  ReaderAdapterState,
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { ResolvedReaderSource } from '../source'
import type { ComicArchive } from './comic-archive'
import { fixedPageAnnotationTint } from '../fixed-page/annotations'
import { clampFixedPageScale } from '../fixed-page/geometry'
import { FixedPageRegionSelectionController } from '../fixed-page/region-selection'
import { FixedPageViewportController } from '../fixed-page/viewport'
import { readerZoomScaleCapability } from '../reader-adapter'
import { openComicArchive } from './comic-archive'

type ComicSource = ResolvedReaderSource & { format: 'cbr' | 'cbz' }

function pageLabel(path: string, index: number): string {
  const filename = path.split('/').at(-1)?.trim()
  return filename && filename.length > 0 ? filename : `Page ${index + 1}`
}

class ComicAdapter implements ReaderAdapter {
  private annotationLayer: HTMLDivElement | null = null
  private annotations: readonly ReaderAnnotation[] = []
  private container: HTMLElement | null = null
  private destroyed = false
  private image: HTMLImageElement | null = null
  private imageNaturalHeight = 0
  private imageNaturalWidth = 0
  private objectUrl: string | null = null
  private pageIndex = 0
  private readonly outline: readonly ReaderOutlineItem[]
  private readonly outlineIndexes = new Map<string, number>()
  private readonly regionSelection: FixedPageRegionSelectionController
  private renderGeneration = 0
  private resizeObserver: ResizeObserver | null = null
  private scale = 1
  private scroller: HTMLDivElement | null = null
  private surface: HTMLDivElement | null = null
  private viewport: FixedPageViewportController | null = null

  constructor(
    private readonly source: ComicSource,
    private readonly archive: ComicArchive,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {
    this.regionSelection = new FixedPageRegionSelectionController({
      applyEnabledState: (capture, enabled) => {
        capture.style.cursor = enabled ? 'crosshair' : 'auto'
        capture.style.pointerEvents = enabled ? 'auto' : 'none'
      },
      createDraft: () => {
        const draft = document.createElement('div')
        Object.assign(draft.style, {
          background: 'rgba(0, 113, 227, 0.18)',
          border: '1px solid rgba(0, 113, 227, 0.8)',
          borderRadius: '3px',
          position: 'absolute',
        })
        return draft
      },
      onSelection: selection => this.publishRegionSelection(selection),
    })
    this.outline = archive.pages.map((page, index) => {
      const id = `comic.${index}`
      this.outlineIndexes.set(id, index)
      return {
        children: [],
        href: `page:${index + 1}`,
        id,
        label: pageLabel(page.name, index),
        navigable: true,
      }
    })
  }

  async mount(container: HTMLElement): Promise<void> {
    if (this.destroyed)
      throw new Error('Cannot mount a destroyed comic reader')
    if (this.container)
      throw new Error('Comic reader is already mounted')
    this.container = container

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
    const image = document.createElement('img')
    image.alt = ''
    image.decoding = 'async'
    Object.assign(image.style, {
      display: 'block',
      height: '100%',
      objectFit: 'contain',
      userSelect: 'none',
      width: '100%',
    })
    const annotationLayer = document.createElement('div')
    Object.assign(annotationLayer.style, { inset: '0', pointerEvents: 'none', position: 'absolute' })
    const regionCapture = document.createElement('div')
    regionCapture.setAttribute('aria-hidden', 'true')
    Object.assign(regionCapture.style, { inset: '0', pointerEvents: 'none', position: 'absolute' })
    surface.append(image, annotationLayer, regionCapture)
    scroller.append(surface)
    container.append(scroller)
    this.scroller = scroller
    this.surface = surface
    this.image = image
    this.annotationLayer = annotationLayer
    this.regionSelection.mount(surface, regionCapture)
    this.viewport = new FixedPageViewportController(scroller)
    this.resizeObserver = new ResizeObserver(() => this.layoutImage())
    this.resizeObserver.observe(scroller)
    await this.renderPage('start')
  }

  clearSelection(): void {
    this.setRegionSelectionEnabled(false)
    this.callbacks.onSelectionChange(null)
  }

  async destroy(): Promise<void> {
    if (this.destroyed)
      return
    this.destroyed = true
    this.renderGeneration += 1
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.regionSelection.destroy()
    this.viewport?.destroy()
    this.viewport = null
    if (this.objectUrl)
      URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = null
    this.container?.replaceChildren()
    this.container = null
    await this.archive.close()
  }

  async goBackward(entryEdge: ReaderPageEdge): Promise<void> {
    if (this.pageIndex === 0)
      return
    this.pageIndex -= 1
    this.clearSelection()
    await this.renderPage(entryEdge)
  }

  async goForward(entryEdge: ReaderPageEdge): Promise<void> {
    if (this.pageIndex >= this.archive.pages.length - 1)
      return
    this.pageIndex += 1
    this.clearSelection()
    await this.renderPage(entryEdge)
  }

  async goToAnnotation(annotationId: string): Promise<void> {
    const annotation = this.annotations.find(item => item.id === annotationId)
    if (!annotation || (annotation.anchor.format !== 'cbz' && annotation.anchor.format !== 'cbr'))
      throw new Error(`Comic annotation ${annotationId} does not exist`)
    this.pageIndex = annotation.anchor.pageNumber - 1
    await this.renderPage('start')
    this.annotationLayer?.querySelector<HTMLElement>(`[data-annotation-id="${CSS.escape(annotationId)}"]`)
      ?.scrollIntoView({ block: 'center', inline: 'center' })
  }

  async goToOutlineItem(outlineItemId: string): Promise<void> {
    const index = this.outlineIndexes.get(outlineItemId)
    if (index === undefined)
      throw new Error(`Comic outline item ${outlineItemId} does not exist`)
    this.pageIndex = index
    this.clearSelection()
    await this.renderPage('start')
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    return this.viewport?.move(direction) ?? 'at-boundary'
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    this.annotations = annotations
    this.renderAnnotations()
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    this.regionSelection.setEnabled(enabled)
  }

  async setScale(scale: number): Promise<void> {
    const nextScale = clampFixedPageScale(scale)
    if (nextScale === this.scale)
      return
    this.scale = nextScale
    this.clearSelection()
    this.layoutImage()
    this.viewport?.positionAtEdge('start', 'next-frame')
    this.emitState()
  }

  private publishRegionSelection(result: FixedPageRegionSelectionResult | null): void {
    if (!result) {
      this.callbacks.onSelectionChange(null)
      return
    }
    const anchor: ReaderComicRegionAnchor = {
      format: this.source.format,
      pageNumber: this.pageIndex + 1,
      rect: result.rect,
      type: 'region',
    }
    this.callbacks.onSelectionChange({
      clientRect: result.clientRect,
      selection: { anchor, type: 'region' },
    })
  }

  private async renderPage(entryEdge: ReaderPageEdge): Promise<void> {
    const image = this.image
    if (!image)
      throw new Error('Comic reader image is not mounted')
    const generation = ++this.renderGeneration
    const blob = await this.archive.readPage(this.pageIndex)
    if (this.destroyed || generation !== this.renderGeneration)
      return
    const nextUrl = URL.createObjectURL(blob)
    const nextImage = new Image()
    nextImage.decoding = 'async'
    nextImage.src = nextUrl
    try {
      await nextImage.decode()
    }
    catch (error) {
      URL.revokeObjectURL(nextUrl)
      throw new Error(`Unable to decode comic page ${this.pageIndex + 1}`, { cause: error })
    }
    if (this.destroyed || generation !== this.renderGeneration) {
      URL.revokeObjectURL(nextUrl)
      return
    }
    const previousUrl = this.objectUrl
    this.objectUrl = nextUrl
    this.imageNaturalWidth = nextImage.naturalWidth
    this.imageNaturalHeight = nextImage.naturalHeight
    image.src = nextUrl
    image.setAttribute('aria-label', `Page ${this.pageIndex + 1} of ${this.archive.pages.length}`)
    this.layoutImage()
    this.renderAnnotations()
    this.viewport?.positionAtEdge(entryEdge, 'next-frame')
    if (previousUrl)
      URL.revokeObjectURL(previousUrl)
    this.emitState()
  }

  private layoutImage(): void {
    const scroller = this.scroller
    const surface = this.surface
    if (!scroller || !surface || this.imageNaturalWidth <= 0 || this.imageNaturalHeight <= 0)
      return
    const availableWidth = Math.max(1, scroller.clientWidth - 48)
    const availableHeight = Math.max(1, scroller.clientHeight - 48)
    const fitScale = Math.min(1, availableWidth / this.imageNaturalWidth, availableHeight / this.imageNaturalHeight)
    const displayScale = fitScale * this.scale
    surface.style.width = `${Math.max(1, Math.round(this.imageNaturalWidth * displayScale))}px`
    surface.style.height = `${Math.max(1, Math.round(this.imageNaturalHeight * displayScale))}px`
  }

  private renderAnnotations(): void {
    const layer = this.annotationLayer
    if (!layer)
      return
    layer.replaceChildren()
    for (const annotation of this.annotations) {
      const anchor = annotation.anchor
      if ((anchor.format !== this.source.format) || anchor.type !== 'region' || anchor.pageNumber !== this.pageIndex + 1)
        continue
      const marker = document.createElement('button')
      marker.dataset.annotationId = annotation.id
      marker.setAttribute('aria-label', `Annotation on page ${anchor.pageNumber}`)
      marker.type = 'button'
      const tint = fixedPageAnnotationTint(annotation.color)
      Object.assign(marker.style, {
        background: tint,
        border: annotation.kind === 'annotation' ? `2px solid ${tint}` : '0',
        cursor: 'pointer',
        height: `${anchor.rect.height * 100}%`,
        left: `${anchor.rect.x * 100}%`,
        padding: '0',
        pointerEvents: 'auto',
        position: 'absolute',
        top: `${anchor.rect.y * 100}%`,
        width: `${anchor.rect.width * 100}%`,
      })
      marker.addEventListener('click', () => this.callbacks.onAnnotationActivate({ annotationId: annotation.id }))
      layer.append(marker)
    }
  }

  private emitState(): void {
    if (this.destroyed)
      return
    const pageNumber = this.pageIndex + 1
    const pageCount = this.archive.pages.length
    const state: ReaderAdapterState = {
      canGoBackward: this.pageIndex > 0,
      canGoForward: this.pageIndex < pageCount - 1,
      capabilities: {
        annotations: true,
        regionSelection: true,
        scale: readerZoomScaleCapability,
        textSelection: false,
      },
      format: this.source.format,
      location: {
        format: this.source.format,
        href: `page:${pageNumber}`,
        label: `Page ${pageNumber} of ${pageCount}`,
        position: pageNumber,
        progression: pageCount === 1 ? 1 : this.pageIndex / (pageCount - 1),
        total: pageCount,
      },
      outline: this.outline,
      presentationMode: 'publisher',
      scale: this.scale,
      title: this.source.name,
    }
    this.callbacks.onStateChange(state)
  }
}

export async function openComicAdapter(
  source: ComicSource,
  callbacks: ReaderAdapterCallbacks,
): Promise<ReaderAdapter> {
  const archive = await openComicArchive(source)
  return new ComicAdapter(source, archive, callbacks)
}
