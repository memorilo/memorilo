import type {
  ReaderAnnotation,
  ReaderPosition,
} from '../../types'
import type {
  ReaderAdapterCallbacks,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import type { ComicArchive } from './comic-archive'
import type { ComicContinuousPage } from './comic-continuous-page'
import type { ComicFormat } from './comic-page-surface'
import { combineLifecycleFailures, createResourceScope } from '@memorilo/effect-lifecycle'
import { AnnotationActivationOwner, annotationOverlayTint } from '../annotations'
import { interruptPromise } from '../interrupt-promise'
import { toReaderError } from '../reader-adapter'
import {
  configureComicContinuousImage,
  createComicContinuousPage,
} from './comic-continuous-page'

interface OpenComicContinuousReaderMountOptions {
  annotations: readonly ReaderAnnotation[]
  callbacks: ReaderAdapterCallbacks
  format: ComicFormat
  initialPosition: Extract<ReaderPosition, { format: ComicFormat }>
  name: string
  onPositionChange: (pageNumber: number, pageProgress: number) => void
  onRegionSelection: (pageNumber: number, selection: RegionSelectionResult | null) => void
  scale: number
  signal: AbortSignal
}

const estimatedPageHeight = 1000
const scrollStep = 48
const scrollTolerance = 1

function createSlot(pageNumber: number): HTMLDivElement {
  const slot = document.createElement('div')
  slot.dataset.pageNumber = String(pageNumber)
  Object.assign(slot.style, {
    alignItems: 'flex-start',
    containIntrinsicSize: `1px ${estimatedPageHeight}px`,
    contentVisibility: 'auto',
    display: 'flex',
    flex: '0 0 auto',
    justifyContent: 'center',
    minHeight: `${estimatedPageHeight}px`,
    width: '100%',
  })
  return slot
}

export class ComicContinuousReaderMount {
  readonly #activation: AnnotationActivationOwner
  readonly #archive: ComicArchive
  readonly #callbacks: ReaderAdapterCallbacks
  readonly #format: ComicFormat
  readonly #lifetime = new AbortController()
  readonly #list: HTMLDivElement
  readonly #loading = new Map<number, Promise<boolean>>()
  readonly #observer: IntersectionObserver
  readonly #onPositionChange: OpenComicContinuousReaderMountOptions['onPositionChange']
  readonly #onRegionSelection: OpenComicContinuousReaderMountOptions['onRegionSelection']
  readonly #pages = new Map<number, ComicContinuousPage>()
  readonly #resizeObserver: ResizeObserver
  readonly #resources: ReturnType<typeof createResourceScope>
  readonly #scroller: HTMLDivElement
  readonly #slots: readonly HTMLDivElement[]
  readonly #wantedPages = new Set<number>()
  #annotations: readonly ReaderAnnotation[]
  #closed = false
  #positionFrame: number | null = null
  #regionSelectionEnabled = false
  #scale: number

  private constructor(
    resources: ReturnType<typeof createResourceScope>,
    archive: ComicArchive,
    options: OpenComicContinuousReaderMountOptions,
    scroller: HTMLDivElement,
    list: HTMLDivElement,
    slots: readonly HTMLDivElement[],
  ) {
    this.#annotations = options.annotations
    this.#archive = archive
    this.#callbacks = options.callbacks
    this.#format = options.format
    this.#list = list
    this.#onPositionChange = options.onPositionChange
    this.#onRegionSelection = options.onRegionSelection
    this.#resources = resources
    this.#scale = options.scale
    this.#scroller = scroller
    this.#slots = slots
    this.#activation = new AnnotationActivationOwner(
      list,
      annotationId => options.callbacks.onAnnotationActivate({ annotationId }),
    )
    this.#observer = new IntersectionObserver(entries => this.#observePages(entries), {
      root: scroller,
      rootMargin: '150% 0px',
    })
    this.#resizeObserver = new ResizeObserver(() => {
      if (this.#closed)
        return
      for (const page of this.#pages.values())
        this.#layoutPage(page)
      this.#schedulePosition()
    })
    for (const slot of slots)
      this.#observer.observe(slot)
    scroller.addEventListener('scroll', this.#schedulePosition, { passive: true })
  }

  static async open(
    container: HTMLElement,
    archive: ComicArchive,
    options: OpenComicContinuousReaderMountOptions,
  ): Promise<ComicContinuousReaderMount> {
    const resources = createResourceScope('continuous comic reader mount')
    try {
      const surface = (await resources.acquire({
        acquire: () => {
          const scroller = document.createElement('div')
          scroller.setAttribute('role', 'document')
          scroller.setAttribute('aria-label', options.name)
          Object.assign(scroller.style, {
            background: '#fff',
            boxSizing: 'border-box',
            height: '100%',
            overflow: 'auto',
            width: '100%',
          })
          const list = document.createElement('div')
          Object.assign(list.style, {
            alignItems: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            minWidth: '100%',
            padding: '24px',
            width: 'max-content',
          })
          scroller.append(list)
          container.append(scroller)
          return { list, scroller }
        },
        close: owned => owned.scroller.remove(),
        name: 'continuous comic surface',
      })).resource
      const slots = Array.from(
        { length: archive.pages.length },
        (_, index) => createSlot(index + 1),
      )
      surface.list.append(...slots)
      const mount = new ComicContinuousReaderMount(
        resources,
        archive,
        options,
        surface.scroller,
        surface.list,
        slots,
      )
      await resources.acquire({
        acquire: () => mount,
        close: owned => owned.closeInternals(),
        name: 'continuous comic pages and observers',
      })
      if (!await mount.ensurePage(options.initialPosition.pageNumber, options.signal))
        throw new Error('Comic initial page rendering did not complete')
      const adjacentPages = [options.initialPosition.pageNumber - 1, options.initialPosition.pageNumber + 1]
        .filter(pageNumber => pageNumber >= 1 && pageNumber <= archive.pages.length)
      const adjacentRendered = await Promise.all(adjacentPages.map(pageNumber => (
        mount.ensurePage(pageNumber, options.signal)
      )))
      if (adjacentRendered.some(rendered => !rendered))
        throw new Error('Comic adjacent page rendering did not complete')
      mount.#resizeObserver.observe(surface.scroller)
      resources.commit()
      return mount
    }
    catch (error) {
      return resources.rollback(error)
    }
  }

  close(): Promise<void> {
    this.#closed = true
    return this.#resources.close()
  }

  ensurePage(pageNumber: number, signal: AbortSignal): Promise<boolean> {
    if (this.#closed || pageNumber < 1 || pageNumber > this.#slots.length)
      return Promise.resolve(false)
    this.#wantedPages.add(pageNumber)
    if (this.#pages.has(pageNumber))
      return Promise.resolve(true)
    const existing = this.#loading.get(pageNumber)
    if (existing)
      return existing
    const loading = this.#loadPage(pageNumber, signal).finally(() => {
      if (this.#loading.get(pageNumber) === loading)
        this.#loading.delete(pageNumber)
    })
    this.#loading.set(pageNumber, loading)
    return loading
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    if (direction === 'left' || direction === 'right')
      return 'at-boundary'
    const maximum = Math.max(0, this.#scroller.scrollHeight - this.#scroller.clientHeight)
    const current = this.#scroller.scrollTop
    const pageMove = direction === 'page-down' || direction === 'page-up'
    const amount = pageMove ? Math.max(1, this.#scroller.clientHeight * 0.9) : scrollStep
    const forward = direction === 'down' || direction === 'page-down'
    const next = Math.min(maximum, Math.max(0, current + (forward ? amount : -amount)))
    if (Math.abs(next - current) <= scrollTolerance)
      return 'at-boundary'
    this.#scroller.scrollTo({ behavior: 'auto', top: next })
    return 'scrolled'
  }

  positionAt(pageNumber: number, pageProgress: number): void {
    const slot = this.#slots[pageNumber - 1]
    if (!slot)
      throw new RangeError(`Comic page ${pageNumber} is outside the archive`)
    const scrollerRect = this.#scroller.getBoundingClientRect()
    const slotRect = slot.getBoundingClientRect()
    const top = this.#scroller.scrollTop
      + slotRect.top
      - scrollerRect.top
      + slotRect.height * pageProgress
      - this.#scroller.clientHeight / 2
    this.#scroller.scrollTop = Math.max(0, top)
    this.#schedulePosition()
  }

  async scrollToAnnotation(annotationId: string): Promise<void> {
    const annotation = this.#annotations.find(candidate => candidate.id === annotationId)
    const anchor = annotation?.anchors.find(candidate => candidate.format === this.#format)
    if (!annotation || !anchor || anchor.type !== 'region'
      || (anchor.format !== 'cbr' && anchor.format !== 'cbz')) {
      throw new Error(`Comic annotation ${annotationId} does not exist`)
    }
    await this.ensurePage(anchor.pageNumber, this.#lifetime.signal)
    const marker = this.#slots[anchor.pageNumber - 1]?.querySelector<HTMLElement>(
      `[data-annotation-id="${CSS.escape(annotationId)}"]`,
    )
    if (!marker)
      throw new Error(`Comic annotation ${annotationId} has no rendered marker`)
    marker.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' })
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    this.#annotations = annotations
    for (const page of this.#pages.values())
      this.#renderAnnotations(page)
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    if (enabled === this.#regionSelectionEnabled)
      return
    this.#regionSelectionEnabled = enabled
    for (const page of this.#pages.values())
      page.regionSelection.setEnabled(enabled)
    this.#callbacks.onRegionSelectionModeChange(enabled)
  }

  setScale(scale: number): void {
    this.#scale = scale
    for (const page of this.#pages.values())
      this.#layoutPage(page)
    this.#schedulePosition()
  }

  async #loadPage(pageNumber: number, signal: AbortSignal): Promise<boolean> {
    const combinedSignal = AbortSignal.any([signal, this.#lifetime.signal])
    const blob = await this.#archive.readPage(pageNumber - 1, combinedSignal)
    combinedSignal.throwIfAborted()
    const objectUrl = URL.createObjectURL(blob)
    let stagedPage: ComicContinuousPage | undefined
    try {
      const image = new Image()
      configureComicContinuousImage(image, pageNumber, this.#slots.length)
      image.src = objectUrl
      await interruptPromise(image.decode(), combinedSignal)
      if (this.#closed || !this.#wantedPages.has(pageNumber)) {
        URL.revokeObjectURL(objectUrl)
        return false
      }
      const slot = this.#slots[pageNumber - 1]
      if (!slot)
        throw new RangeError(`Comic page ${pageNumber} is outside the archive`)
      stagedPage = createComicContinuousPage({
        image,
        objectUrl,
        onRegionSelection: selection => this.#onRegionSelection(pageNumber, selection),
        onRegionSelectionEnabledChange: enabled => this.#syncRegionSelection(enabled),
        pageNumber,
        regionSelectionEnabled: this.#regionSelectionEnabled,
        slot,
      })
      this.#pages.set(pageNumber, stagedPage)
      this.#renderAnnotations(stagedPage)
      this.#layoutPage(stagedPage)
      this.#schedulePosition()
      return true
    }
    catch (error) {
      if (!stagedPage) {
        URL.revokeObjectURL(objectUrl)
        throw error
      }
      this.#pages.delete(pageNumber)
      try {
        stagedPage.close()
      }
      catch (cleanupError) {
        throw combineLifecycleFailures(
          [error, cleanupError],
          `Failed to stage and close continuous comic page ${pageNumber}`,
        )
      }
      throw error
    }
  }

  private currentPosition(): { pageNumber: number, pageProgress: number } {
    const center = this.#scroller.getBoundingClientRect().top + this.#scroller.clientHeight / 2
    let nearest = this.#slots[0]
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const slot of this.#slots) {
      const rect = slot.getBoundingClientRect()
      const distance = center < rect.top ? rect.top - center : center > rect.bottom ? center - rect.bottom : 0
      if (distance < nearestDistance) {
        nearest = slot
        nearestDistance = distance
      }
      if (distance === 0)
        break
    }
    if (!nearest)
      throw new Error('Comic archive does not contain a page slot')
    const rect = nearest.getBoundingClientRect()
    const pageNumber = Number(nearest.dataset.pageNumber)
    if (!Number.isSafeInteger(pageNumber))
      throw new Error('Comic page slot does not contain a valid page number')
    const pageProgress = rect.height <= 0
      ? 0
      : Math.min(1, Math.max(0, (center - rect.top) / rect.height))
    return { pageNumber, pageProgress }
  }

  #layoutPage(page: ComicContinuousPage): void {
    if (page.imageNaturalWidth <= 0 || page.imageNaturalHeight <= 0)
      throw new Error(`Comic page ${page.pageNumber} does not have valid image dimensions`)
    const availableWidth = Math.max(1, this.#scroller.clientWidth - 48)
    const fitScale = Math.min(1, availableWidth / page.imageNaturalWidth)
    const displayScale = fitScale * this.#scale
    const width = Math.max(1, Math.round(page.imageNaturalWidth * displayScale))
    const height = Math.max(1, Math.round(page.imageNaturalHeight * displayScale))
    page.surface.style.width = `${width}px`
    page.surface.style.height = `${height}px`
    page.slot.style.minHeight = `${height}px`
  }

  #observePages(entries: readonly IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const slot = entry.target as HTMLDivElement
      const pageNumber = Number(slot.dataset.pageNumber)
      if (entry.isIntersecting) {
        this.#wantedPages.add(pageNumber)
        void this.ensurePage(pageNumber, this.#lifetime.signal).catch((error) => {
          if (!this.#closed)
            this.#callbacks.onError(toReaderError(error))
        })
        continue
      }
      this.#wantedPages.delete(pageNumber)
      const page = this.#pages.get(pageNumber)
      if (!page)
        continue
      this.#pages.delete(pageNumber)
      try {
        page.close()
      }
      catch (error) {
        if (!this.#closed)
          this.#callbacks.onError(toReaderError(error))
      }
    }
  }

  #renderAnnotations(page: ComicContinuousPage): void {
    page.annotationLayer.replaceChildren(...this.#annotations.flatMap((annotation) => {
      return annotation.anchors.flatMap((anchor): HTMLButtonElement[] => {
        if (anchor.format !== this.#format || anchor.type !== 'region' || anchor.pageNumber !== page.pageNumber)
          return []
        const marker = document.createElement('button')
        marker.dataset.annotationId = annotation.id
        marker.setAttribute('aria-label', this.#callbacks.regionAnnotationLabel())
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
    }))
  }

  #schedulePosition = (): void => {
    if (this.#closed || this.#positionFrame !== null)
      return
    this.#positionFrame = requestAnimationFrame(() => {
      this.#positionFrame = null
      if (this.#closed)
        return
      const position = this.currentPosition()
      this.#onPositionChange(position.pageNumber, position.pageProgress)
    })
  }

  #syncRegionSelection(enabled: boolean): void {
    if (enabled === this.#regionSelectionEnabled)
      return
    this.#regionSelectionEnabled = enabled
    for (const page of this.#pages.values())
      page.regionSelection.setEnabled(enabled)
    this.#callbacks.onRegionSelectionModeChange(enabled)
  }

  private closeInternals(): void {
    this.#closed = true
    this.#lifetime.abort(new Error('Continuous comic reader closed'))
    this.#observer.disconnect()
    this.#resizeObserver.disconnect()
    this.#scroller.removeEventListener('scroll', this.#schedulePosition)
    this.#activation.close()
    if (this.#positionFrame !== null)
      cancelAnimationFrame(this.#positionFrame)
    this.#positionFrame = null
    const pages = [...this.#pages.values()]
    this.#pages.clear()
    for (const page of pages)
      page.close()
  }
}
