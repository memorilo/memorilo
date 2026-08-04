import type {
  ReaderAnnotation,
  ReaderAnnotationColor,
  ReaderComicRegionAnchor,
  ReaderNormalizedRect,
  ReaderOutlineItem,
} from '../../types'
import type {
  ReaderAdapter,
  ReaderAdapterCallbacks,
  ReaderAdapterState,
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { ComicArchive } from './comic-archive'
import { readerMaximumScale, readerMinimumScale } from '../reader-adapter'
import { openComicArchive } from './comic-archive'

interface ComicSource {
  bytes: Uint8Array
  format: 'cbr' | 'cbz'
  name: string
}

interface Point {
  x: number
  y: number
}

const scrollStep = 48
const scrollBoundaryTolerance = 1
const annotationTints: Readonly<Record<ReaderAnnotationColor, string>> = {
  blue: 'rgba(64, 148, 255, 0.34)',
  green: 'rgba(63, 190, 108, 0.34)',
  pink: 'rgba(255, 83, 139, 0.32)',
  purple: 'rgba(140, 98, 255, 0.32)',
  yellow: 'rgba(255, 205, 31, 0.38)',
}

function clampScale(value: number): number {
  return Math.min(readerMaximumScale, Math.max(readerMinimumScale, Math.round(value * 10) / 10))
}

function keyboardScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function normalizedRect(rect: DOMRect, surfaceRect: DOMRect): ReaderNormalizedRect | null {
  const left = Math.max(rect.left, surfaceRect.left)
  const top = Math.max(rect.top, surfaceRect.top)
  const right = Math.min(rect.right, surfaceRect.right)
  const bottom = Math.min(rect.bottom, surfaceRect.bottom)
  if (right <= left || bottom <= top)
    return null
  return {
    height: clampUnit((bottom - top) / surfaceRect.height),
    width: clampUnit((right - left) / surfaceRect.width),
    x: clampUnit((left - surfaceRect.left) / surfaceRect.width),
    y: clampUnit((top - surfaceRect.top) / surfaceRect.height),
  }
}

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
  private keyboardScrollTarget: { direction: ReaderScrollDirection, value: number } | null = null
  private objectUrl: string | null = null
  private pageIndex = 0
  private readonly outline: readonly ReaderOutlineItem[]
  private readonly outlineIndexes = new Map<string, number>()
  private regionCapture: HTMLDivElement | null = null
  private regionDraft: HTMLDivElement | null = null
  private regionSelectionEnabled = false
  private regionStart: Point | null = null
  private renderGeneration = 0
  private resizeObserver: ResizeObserver | null = null
  private scale = 1
  private scroller: HTMLDivElement | null = null
  private surface: HTMLDivElement | null = null

  constructor(
    private readonly source: ComicSource,
    private readonly archive: ComicArchive,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {
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
    regionCapture.addEventListener('pointerdown', event => this.beginRegionSelection(event))
    regionCapture.addEventListener('pointermove', event => this.updateRegionSelection(event))
    regionCapture.addEventListener('pointerup', event => this.finishRegionSelection(event))
    regionCapture.addEventListener('pointercancel', () => this.cancelRegionSelection())
    surface.append(image, annotationLayer, regionCapture)
    scroller.append(surface)
    container.append(scroller)
    this.scroller = scroller
    this.surface = surface
    this.image = image
    this.annotationLayer = annotationLayer
    this.regionCapture = regionCapture
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
    const scroller = this.scroller
    if (!scroller)
      return 'at-boundary'
    const vertical = direction === 'down' || direction === 'up'
    const current = vertical ? scroller.scrollTop : scroller.scrollLeft
    const maximum = vertical
      ? scroller.scrollHeight - scroller.clientHeight
      : scroller.scrollWidth - scroller.clientWidth
    const boundary = direction === 'down' || direction === 'right' ? maximum : 0
    if (maximum <= scrollBoundaryTolerance || Math.abs(boundary - current) <= scrollBoundaryTolerance) {
      this.keyboardScrollTarget = null
      return 'at-boundary'
    }
    const delta = direction === 'down' || direction === 'right' ? scrollStep : -scrollStep
    const base = this.keyboardScrollTarget?.direction === direction ? this.keyboardScrollTarget.value : current
    const next = Math.min(maximum, Math.max(0, base + delta))
    this.keyboardScrollTarget = { direction, value: next }
    if (vertical)
      scroller.scrollTo({ behavior: keyboardScrollBehavior(), top: next })
    else
      scroller.scrollTo({ behavior: keyboardScrollBehavior(), left: next })
    return 'scrolled'
  }

  async recognizeCurrentPage(): Promise<void> {
    throw new Error('OCR is only available for PDF documents')
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    this.annotations = annotations
    this.renderAnnotations()
  }

  async setPresentationMode(): Promise<void> {
    // Comic pages always preserve their image layout.
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    this.regionSelectionEnabled = enabled
    if (this.regionCapture) {
      this.regionCapture.style.cursor = enabled ? 'crosshair' : 'auto'
      this.regionCapture.style.pointerEvents = enabled ? 'auto' : 'none'
    }
    if (!enabled)
      this.cancelRegionSelection()
  }

  async setScale(scale: number): Promise<void> {
    const nextScale = clampScale(scale)
    if (nextScale === this.scale)
      return
    this.scale = nextScale
    this.clearSelection()
    this.layoutImage()
    this.positionViewport('start')
    this.emitState()
  }

  private beginRegionSelection(event: PointerEvent): void {
    if (!this.regionSelectionEnabled || event.button !== 0 || !this.surface || !this.regionCapture)
      return
    event.preventDefault()
    this.regionCapture.setPointerCapture(event.pointerId)
    const rect = this.surface.getBoundingClientRect()
    this.regionStart = {
      x: Math.min(rect.width, Math.max(0, event.clientX - rect.left)),
      y: Math.min(rect.height, Math.max(0, event.clientY - rect.top)),
    }
    const draft = document.createElement('div')
    Object.assign(draft.style, {
      background: 'rgba(0, 113, 227, 0.18)',
      border: '1px solid rgba(0, 113, 227, 0.8)',
      borderRadius: '3px',
      position: 'absolute',
    })
    this.regionDraft = draft
    this.surface.append(draft)
    this.positionRegionDraft(this.regionStart)
  }

  private cancelRegionSelection(): void {
    this.regionDraft?.remove()
    this.regionDraft = null
    this.regionStart = null
  }

  private finishRegionSelection(event: PointerEvent): void {
    if (!this.regionStart || !this.regionDraft || !this.surface)
      return
    this.updateRegionSelection(event)
    const draftRect = this.regionDraft.getBoundingClientRect()
    const rect = normalizedRect(draftRect, this.surface.getBoundingClientRect())
    this.cancelRegionSelection()
    this.setRegionSelectionEnabled(false)
    if (!rect || draftRect.width < 6 || draftRect.height < 6) {
      this.callbacks.onSelectionChange(null)
      return
    }
    const anchor: ReaderComicRegionAnchor = {
      format: this.source.format,
      pageNumber: this.pageIndex + 1,
      rect,
      type: 'region',
    }
    this.callbacks.onSelectionChange({
      clientRect: { height: draftRect.height, left: draftRect.left, top: draftRect.top, width: draftRect.width },
      selection: { anchor, type: 'region' },
    })
  }

  private updateRegionSelection(event: PointerEvent): void {
    if (!this.regionStart || !this.surface)
      return
    const rect = this.surface.getBoundingClientRect()
    this.positionRegionDraft({
      x: Math.min(rect.width, Math.max(0, event.clientX - rect.left)),
      y: Math.min(rect.height, Math.max(0, event.clientY - rect.top)),
    })
  }

  private positionRegionDraft(point: Point): void {
    if (!this.regionStart || !this.regionDraft)
      return
    const left = Math.min(this.regionStart.x, point.x)
    const top = Math.min(this.regionStart.y, point.y)
    Object.assign(this.regionDraft.style, {
      height: `${Math.abs(point.y - this.regionStart.y)}px`,
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.abs(point.x - this.regionStart.x)}px`,
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
    this.positionViewport(entryEdge)
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

  private positionViewport(edge: ReaderPageEdge): void {
    const scroller = this.scroller
    if (!scroller)
      return
    this.keyboardScrollTarget = null
    requestAnimationFrame(() => scroller.scrollTo({
      behavior: 'auto',
      left: edge === 'start' ? 0 : Math.max(0, scroller.scrollWidth - scroller.clientWidth),
      top: edge === 'start' ? 0 : Math.max(0, scroller.scrollHeight - scroller.clientHeight),
    }))
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
      Object.assign(marker.style, {
        background: annotationTints[annotation.color],
        border: annotation.kind === 'annotation' ? `2px solid ${annotationTints[annotation.color]}` : '0',
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
        ocr: false,
        presentationModes: ['publisher'],
        regionSelection: true,
        scale: true,
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
  const archive = await openComicArchive(source.format, source.bytes)
  return new ComicAdapter(source, archive, callbacks)
}
