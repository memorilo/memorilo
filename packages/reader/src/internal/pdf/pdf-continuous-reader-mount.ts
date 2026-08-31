import type { PDFDocumentProxy } from 'pdfjs-dist'
import type {
  ReaderAnnotation,
  ReaderOcrProvider,
  ReaderPosition,
  ReaderTextLayerKind,
} from '../../types'
import type {
  ReaderAdapterCallbacks,
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import type { PdfContinuousPage } from './pdf-continuous-page'
import type { PdfOutlineNode } from './pdf-outline-navigation'
import type { PdfJsModule } from './pdf-page-view'
import type { PdfSource } from './pdf-reader-mount'
import { combineLifecycleFailures, createResourceScope } from '@memorilo/effect-lifecycle'
import { interruptPromise } from '../interrupt-promise'
import { toReaderError } from '../reader-adapter'
import { createPdfContinuousPage } from './pdf-continuous-page'
import { projectPdfContinuousTextSelection } from './pdf-continuous-text-selection'
import { openPdfDocumentSession } from './pdf-document-session'
import { pdfLayerClassNames } from './pdf-layer.stylex'
import { PdfOutlineNavigation } from './pdf-outline-navigation'

interface OpenPdfContinuousReaderMountOptions {
  annotations: readonly ReaderAnnotation[]
  callbacks: ReaderAdapterCallbacks
  container: HTMLElement
  initialPosition: Extract<ReaderPosition, { format: 'pdf' }>
  ocrProvider?: ReaderOcrProvider
  onPositionChange: (pageNumber: number, pageProgress: number, kind: ReaderTextLayerKind) => void
  onResize: () => void
  scale: number
  signal: AbortSignal
  source: PdfSource
}

interface ContinuousPdfPageRender {
  availableWidth: number
  forceOcr: boolean
  promise: Promise<boolean>
  scale: number
}

const estimatedPageHeight = 960
const scrollStep = 48
const scrollTolerance = 1

function createPageSlot(ownerDocument: Document, pageNumber: number): HTMLDivElement {
  const slot = ownerDocument.createElement('div')
  slot.className = `reader-pdf-page-slot ${pdfLayerClassNames.pageSlot}`
  slot.dataset.pageNumber = String(pageNumber)
  slot.style.containIntrinsicSize = `1px ${estimatedPageHeight}px`
  slot.style.contentVisibility = 'auto'
  slot.style.minHeight = `${estimatedPageHeight}px`
  return slot
}

function selectionIntersects(root: Node): boolean {
  const selection = root.ownerDocument?.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return false
  return selection.getRangeAt(0).intersectsNode(root)
}

export class PdfContinuousReaderMount {
  readonly initialPageNumber: number
  readonly numPages: number

  readonly #callbacks: ReaderAdapterCallbacks
  readonly #document: PDFDocumentProxy
  readonly #lifetime = new AbortController()
  readonly #observer: IntersectionObserver
  readonly #outline: PdfOutlineNavigation
  readonly #pages = new Map<number, PdfContinuousPage>()
  readonly #pageRenders = new Map<number, ContinuousPdfPageRender>()
  readonly #pdfJs: PdfJsModule
  readonly #resources: ReturnType<typeof createResourceScope>
  readonly #resizeObserver: ResizeObserver
  readonly #scroller: HTMLDivElement
  readonly #slots: readonly HTMLDivElement[]
  readonly #onPositionChange: OpenPdfContinuousReaderMountOptions['onPositionChange']
  readonly #ocrProvider: ReaderOcrProvider | undefined
  #annotations: readonly ReaderAnnotation[]
  #closed = false
  #hasUserScrolled = false
  #positionFrame: number | null = null
  #regionSelectionEnabled = false
  #scale: number

  private constructor(
    options: OpenPdfContinuousReaderMountOptions,
    resources: ReturnType<typeof createResourceScope>,
    document: PDFDocumentProxy,
    pdfJs: PdfJsModule,
    outline: PdfOutlineNavigation,
    scroller: HTMLDivElement,
    slots: readonly HTMLDivElement[],
  ) {
    this.#annotations = options.annotations
    this.#callbacks = options.callbacks
    this.#document = document
    this.#ocrProvider = options.ocrProvider
    this.#outline = outline
    this.#pdfJs = pdfJs
    this.#resources = resources
    this.#scale = options.scale
    this.#scroller = scroller
    this.#slots = slots
    this.#onPositionChange = options.onPositionChange
    this.initialPageNumber = options.initialPosition.pageNumber
    this.numPages = document.numPages
    this.#observer = new IntersectionObserver(entries => this.#observePages(entries), {
      root: scroller,
      rootMargin: '150% 0px',
    })
    this.#resizeObserver = new ResizeObserver(() => {
      if (!this.#closed)
        options.onResize()
    })
    scroller.addEventListener('scroll', this.#handleScroll, { passive: true })
  }

  static async open(options: OpenPdfContinuousReaderMountOptions): Promise<PdfContinuousReaderMount> {
    const resources = createResourceScope('continuous PDF reader mount')
    try {
      const surface = (await resources.acquire({
        acquire: () => {
          const ownerDocument = options.container.ownerDocument
          if (!ownerDocument)
            throw new Error('The PDF reader container is not attached to a document')
          const scroller = ownerDocument.createElement('div')
          scroller.className = pdfLayerClassNames.scrollerContinuous
          scroller.dataset.ui = 'reader-pdf-scroller'
          scroller.setAttribute('role', 'document')
          scroller.setAttribute('aria-label', options.source.name)
          const list = ownerDocument.createElement('div')
          list.className = pdfLayerClassNames.continuousList
          scroller.append(list)
          options.container.append(scroller)
          return { list, scroller }
        },
        close: owned => owned.scroller.remove(),
        name: 'continuous PDF surface',
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
      const initialPageNumber = Math.min(options.initialPosition.pageNumber, document.numPages)
      const initialPosition = { ...options.initialPosition, pageNumber: initialPageNumber }
      const outline = new PdfOutlineNavigation()
      outline.load(await interruptPromise(
        document.getOutline() as Promise<PdfOutlineNode[] | null>,
        options.signal,
      ))
      options.signal.throwIfAborted()

      const slots = Array.from(
        { length: document.numPages },
        (_, index) => createPageSlot(surface.scroller.ownerDocument, index + 1),
      )
      surface.list.append(...slots)
      const mount = new PdfContinuousReaderMount(
        { ...options, initialPosition },
        resources,
        document,
        pdfJs,
        outline,
        surface.scroller,
        slots,
      )
      await resources.acquire({
        acquire: () => mount,
        close: owned => owned.closeInternals(),
        name: 'continuous PDF pages and observers',
      })
      if (!await mount.#activatePage(initialPageNumber, false, options.signal))
        throw new Error('PDF initial page rendering did not complete')
      const adjacentPages = [initialPageNumber - 1, initialPageNumber + 1]
        .filter(pageNumber => pageNumber >= 1 && pageNumber <= document.numPages)
      const adjacentRendered = await Promise.all(adjacentPages.map(pageNumber => (
        mount.#activatePage(pageNumber, false, options.signal)
      )))
      if (adjacentRendered.some(rendered => !rendered))
        throw new Error('PDF adjacent page rendering did not complete')
      mount.#startObservingSlots()
      mount.#resizeObserver.observe(surface.scroller)
      resources.commit()
      return mount
    }
    catch (error) {
      return resources.rollback(error)
    }
  }

  get outlineItems() {
    return this.#outline.items
  }

  close(): Promise<void> {
    this.#closed = true
    return this.#resources.close()
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

  pageNumberForOutline(outlineItemId: string, signal: AbortSignal): Promise<number> {
    return interruptPromise(this.#outline.pageNumber(outlineItemId, this.#document), signal)
  }

  positionAtEdge(edge: ReaderPageEdge): void {
    const { pageNumber } = this.currentPosition()
    this.#slots[pageNumber - 1]?.scrollIntoView({
      behavior: 'auto',
      block: edge === 'start' ? 'start' : 'end',
    })
  }

  positionAt(pageNumber: number, pageProgress: number): void {
    const slot = this.#slots[pageNumber - 1]
    if (!slot)
      throw new RangeError(`PDF page ${pageNumber} is outside the document`)
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

  async render(input: {
    forceOcr: boolean
    pageNumber: number
    scale: number
    signal: AbortSignal
  }): Promise<boolean> {
    this.#scale = input.scale
    if (!await this.#activatePage(input.pageNumber, input.forceOcr, input.signal))
      return false
    const active = [...this.#pages.values()]
    await Promise.all(active
      .filter(page => page.pageNumber !== input.pageNumber)
      .map(page => page.render(false, this.availablePageWidth(), input.scale, input.signal)))
    return !this.#closed && !input.signal.aborted
  }

  renderCurrentLayout(
    pageNumber: number,
    scale: number,
    signal: AbortSignal,
  ): Promise<boolean> {
    return this.render({ forceOcr: false, pageNumber, scale, signal })
  }

  async scrollAnnotationIntoView(annotationId: string): Promise<void> {
    const annotation = this.#annotations.find(candidate => candidate.id === annotationId)
    const anchor = annotation?.anchors.find(candidate => candidate.format === 'pdf')
    if (!annotation || !anchor || anchor.format !== 'pdf')
      throw new Error(`PDF annotation ${annotationId} does not exist`)
    await this.#activatePage(anchor.pageNumber, false, this.#lifetime.signal)
    const marker = this.#slots[anchor.pageNumber - 1]?.querySelector<HTMLElement>(
      `[data-annotation-id="${CSS.escape(annotationId)}"]`,
    )
    if (!marker)
      throw new Error(`PDF annotation ${annotationId} has no rendered marker`)
    marker.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' })
  }

  setAnnotations(annotations: readonly ReaderAnnotation[], _pageNumber?: number): void {
    this.#annotations = annotations
    for (const page of this.#pages.values())
      page.setAnnotations(annotations)
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    if (enabled === this.#regionSelectionEnabled)
      return
    this.#regionSelectionEnabled = enabled
    for (const page of this.#pages.values())
      page.regionSelection.setEnabled(enabled)
    this.#callbacks.onRegionSelectionModeChange(enabled)
  }

  textLayerKindAt(pageNumber: number): ReaderTextLayerKind {
    return this.#pages.get(pageNumber)?.kind ?? 'none'
  }

  private availablePageWidth(): number {
    return Math.max(160, this.#scroller.clientWidth - 48)
  }

  async #activatePage(
    pageNumber: number,
    forceOcr: boolean,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (this.#closed || pageNumber < 1 || pageNumber > this.numPages)
      return false
    const availableWidth = this.availablePageWidth()
    const pending = this.#pageRenders.get(pageNumber)
    if (pending
      && pending.availableWidth === availableWidth
      && pending.forceOcr === forceOcr
      && pending.scale === this.#scale) {
      return interruptPromise(pending.promise, signal)
    }
    if (pending)
      await interruptPromise(pending.promise, signal)
    if (this.#closed || signal.aborted)
      return false
    let page = this.#pages.get(pageNumber)
    const created = page === undefined
    if (!page) {
      page = this.#createPage(pageNumber)
      this.#pages.set(pageNumber, page)
    }
    const render = page.render(forceOcr, availableWidth, this.#scale, signal)
    const tracked = render.finally(() => {
      if (this.#pageRenders.get(pageNumber)?.promise === tracked)
        this.#pageRenders.delete(pageNumber)
    })
    this.#pageRenders.set(pageNumber, {
      availableWidth,
      forceOcr,
      promise: tracked,
      scale: this.#scale,
    })
    try {
      const rendered = await tracked
      return rendered && this.#pages.get(pageNumber) === page
    }
    catch (error) {
      if (created && this.#pages.get(pageNumber) === page) {
        this.#pages.delete(pageNumber)
        try {
          await page.close()
        }
        catch (cleanupError) {
          throw combineLifecycleFailures(
            [error, cleanupError],
            `Failed to render and close continuous PDF page ${pageNumber}`,
          )
        }
      }
      throw error
    }
  }

  #handleScroll = (): void => {
    this.#hasUserScrolled = true
    this.#schedulePosition()
  }

  #captureTextSelection = (): void => {
    queueMicrotask(() => {
      if (this.#closed)
        return
      try {
        this.#publishTextSelection()
      }
      catch (error) {
        this.#callbacks.onError(toReaderError(error))
      }
    })
  }

  #startObservingSlots(): void {
    for (const slot of this.#slots)
      this.#observer.observe(slot)
  }

  #createPage(pageNumber: number): PdfContinuousPage {
    const slot = this.#slots[pageNumber - 1]
    if (!slot)
      throw new RangeError(`PDF page ${pageNumber} is outside the document`)
    return createPdfContinuousPage({
      annotations: this.#annotations,
      callbacks: this.#callbacks,
      document: this.#document,
      ocrProvider: this.#ocrProvider,
      onPositionChange: (nextKind) => {
        const position = this.currentPosition()
        if (position.pageNumber === pageNumber)
          this.#onPositionChange(pageNumber, position.pageProgress, nextKind)
      },
      onRegionSelection: result => this.#publishRegionSelection(pageNumber, result),
      onRegionSelectionEnabledChange: enabled => this.#syncRegionSelection(enabled),
      onTextSelection: this.#captureTextSelection,
      pageNumber,
      pdfJs: this.#pdfJs,
      regionSelectionEnabled: this.#regionSelectionEnabled,
      schedulePosition: this.#schedulePosition,
      slot,
    })
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
      throw new Error('PDF document does not contain a page slot')
    const rect = nearest.getBoundingClientRect()
    const pageNumber = Number(nearest.dataset.pageNumber)
    if (!Number.isSafeInteger(pageNumber))
      throw new Error('PDF page slot does not contain a valid page number')
    const pageProgress = rect.height <= 0
      ? 0
      : Math.min(1, Math.max(0, (center - rect.top) / rect.height))
    return { pageNumber, pageProgress }
  }

  #observePages(entries: readonly IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const slot = entry.target as HTMLDivElement
      const pageNumber = Number(slot.dataset.pageNumber)
      if (entry.isIntersecting) {
        void this.#activatePage(pageNumber, false, this.#lifetime.signal).catch((error) => {
          if (!this.#closed)
            this.#callbacks.onError(toReaderError(error))
        })
        continue
      }
      const page = this.#pages.get(pageNumber)
      // A hidden test window (or a suspended background tab) reports a zero
      // viewport; do not evict pages until layout can provide a meaningful
      // visibility signal.
      if (!page || !this.#hasUserScrolled || this.#scroller.clientHeight === 0 || selectionIntersects(slot))
        continue
      this.#pages.delete(pageNumber)
      void page.close().catch((error) => {
        if (!this.#closed)
          this.#callbacks.onError(toReaderError(error))
      })
    }
  }

  #publishRegionSelection(pageNumber: number, result: RegionSelectionResult | null): void {
    if (!result) {
      this.#callbacks.onSelectionChange(null)
      return
    }
    this.#callbacks.onSelectionChange({
      clientRect: result.clientRect,
      selection: {
        anchors: [{ format: 'pdf', pageNumber, rect: result.rect, type: 'region' }],
        type: 'region',
      },
    })
  }

  #publishTextSelection(): void {
    const ownerDocument = this.#scroller.ownerDocument
    this.#callbacks.onSelectionChange(projectPdfContinuousTextSelection(
      ownerDocument.getSelection(),
      [...this.#pages.values()],
    ))
  }

  #schedulePosition = (): void => {
    if (this.#closed || this.#positionFrame !== null)
      return
    this.#positionFrame = requestAnimationFrame(() => {
      this.#positionFrame = null
      if (this.#closed)
        return
      const position = this.currentPosition()
      this.#onPositionChange(
        position.pageNumber,
        position.pageProgress,
        this.textLayerKindAt(position.pageNumber),
      )
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

  private async closeInternals(): Promise<void> {
    this.#closed = true
    this.#lifetime.abort(new Error('Continuous PDF reader closed'))
    this.#observer.disconnect()
    this.#resizeObserver.disconnect()
    this.#scroller.removeEventListener('scroll', this.#handleScroll)
    if (this.#positionFrame !== null)
      cancelAnimationFrame(this.#positionFrame)
    this.#positionFrame = null
    const pages = [...this.#pages.values()]
    this.#pages.clear()
    this.#pageRenders.clear()
    await Promise.all(pages.map(page => page.close()))
  }
}
