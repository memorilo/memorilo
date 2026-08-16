import type { Link } from '@readium/shared'
import type {
  ReaderAnnotation,
  ReaderPageMode,
  ReaderPresentationMode,
} from '../../types'
import type {
  ReaderAdapterCallbacks,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { ReaderOutlineProjection } from '../reader-outline'
import type { RegionSelectionResult } from '../region-selection'
import type { ContinuousEpubSection } from './epub-continuous-section'
import type { ParsedEpub } from './epub-parser'
import { createResourceScope } from '@memorilo/effect-lifecycle'
import { Locator, LocatorLocations } from '@readium/shared'
import { clampReaderScale, toReaderError } from '../reader-adapter'
import { RegionSelectionController } from '../region-selection'
import { epubOutline, serializedEpubLocator } from './epub-content-projection'
import { renderContinuousEpubAnnotations } from './epub-continuous-annotations'
import { projectContinuousEpubRegionSelection } from './epub-continuous-region-selection'
import {
  appendContinuousEpubSection,
  layoutContinuousEpubSection,
} from './epub-continuous-section'
import {
  projectEpubContinuousTextSelection,
} from './epub-continuous-text-selection'
import { projectEpubReaderState } from './epub-reader-state'
import { normalizeEpubPath, resolveEpubPath } from './epub-resource-content'

interface EpubContinuousReaderMountOptions {
  annotations: readonly ReaderAnnotation[]
  callbacks: ReaderAdapterCallbacks
  container: HTMLElement
  initialLocator: Locator
  pageMode: ReaderPageMode
  parsed: ParsedEpub
  presentationMode: ReaderPresentationMode
  signal: AbortSignal
  sourceName: string
}

const scrollStep = 48
const scrollTolerance = 1

function keyboardEventInput(event: KeyboardEvent) {
  return {
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    key: event.key,
    metaKey: event.metaKey,
    repeat: event.repeat,
    shiftKey: event.shiftKey,
  }
}

export class EpubContinuousReaderMount {
  #activated = false
  #annotations: readonly ReaderAnnotation[]
  readonly #callbacks: ReaderAdapterCallbacks
  #closed = false
  #currentLocator: Locator
  readonly #domEvents = new AbortController()
  readonly #frame: HTMLIFrameElement
  readonly #frameResizeObserver: ResizeObserver
  readonly #host: HTMLDivElement
  #lastStateKey: string | undefined
  readonly #outline: ReaderOutlineProjection<Link>
  readonly #parsed: ParsedEpub
  #positionFrame: number | null = null
  #regionSelection: RegionSelectionController | null
  readonly #resizeObserver: ResizeObserver
  readonly #scope = createResourceScope('continuous EPUB reader mount', { closeMode: 'dependent' })
  readonly #scroller: HTMLDivElement
  readonly #sections: ContinuousEpubSection[] = []
  #scale = 1
  readonly ready: Promise<void>

  private constructor(private readonly options: EpubContinuousReaderMountOptions) {
    this.#annotations = options.annotations
    this.#callbacks = options.callbacks
    this.#currentLocator = options.initialLocator
    this.#parsed = options.parsed
    this.#outline = epubOutline(options.parsed.publication.toc?.items ?? [])

    const host = document.createElement('div')
    Object.assign(host.style, {
      height: '100%',
      overflow: 'hidden',
      position: 'relative',
      width: '100%',
    })
    const scroller = document.createElement('div')
    scroller.tabIndex = 0
    Object.assign(scroller.style, {
      background: '#f3f4f6',
      height: '100%',
      overflow: 'auto',
      width: '100%',
    })
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-label', options.parsed.title || options.sourceName)
    frame.setAttribute('sandbox', 'allow-same-origin')
    frame.scrolling = 'no'
    Object.assign(frame.style, {
      border: '0',
      display: 'block',
      height: '1px',
      width: '100%',
    })
    const regionCapture = document.createElement('div')
    regionCapture.setAttribute('aria-hidden', 'true')
    scroller.append(frame)
    host.append(scroller, regionCapture)
    options.container.append(host)
    this.#frame = frame
    this.#host = host
    this.#scroller = scroller

    const regionSelection = new RegionSelectionController({
      onEnabledChange: enabled => options.callbacks.onRegionSelectionModeChange(enabled),
      onSelection: selection => this.#observe(() => this.#publishRegionSelection(selection)),
    })
    this.#regionSelection = regionSelection
    regionSelection.mount(host, regionCapture)
    this.#resizeObserver = new ResizeObserver(() => this.#observe(() => this.#relayout(true)))
    this.#frameResizeObserver = new ResizeObserver(() => this.#observe(() => this.#relayout(false)))
    scroller.addEventListener('scroll', this.#schedulePosition, {
      passive: true,
      signal: this.#domEvents.signal,
    })

    this.#scope.own({ close: () => this.#closeInternals(), name: 'continuous EPUB resources' })
    this.#scope.own({ close: () => host.remove(), name: 'continuous EPUB DOM' })
    this.ready = this.#open()
  }

  static open(options: EpubContinuousReaderMountOptions): EpubContinuousReaderMount {
    return new EpubContinuousReaderMount(options)
  }

  activate(): void {
    if (this.#closed)
      throw new Error('Continuous EPUB reader is closed')
    this.#activated = true
    this.positionAt(this.#currentLocator)
    this.#applyAnnotations()
    this.#resizeObserver.observe(this.#host)
    const body = this.#frame.contentDocument?.body
    if (body)
      this.#frameResizeObserver.observe(body)
    this.#emitState()
  }

  clearSelection(): void {
    if (this.#closed)
      return
    this.#regionSelection?.setEnabled(false)
    this.#frame.contentWindow?.getSelection()?.removeAllRanges()
    this.#callbacks.onSelectionChange(null)
  }

  close(): Promise<void> {
    this.#closed = true
    this.#activated = false
    return this.#scope.close()
  }

  async goBackward(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const index = this.#currentSectionIndex()
    if (index <= 0)
      return
    const section = this.#sections[index - 1]
    if (!section)
      throw new Error('Previous EPUB section is not loaded')
    this.positionAt(this.#locator(section, 1))
  }

  async goForward(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const index = this.#currentSectionIndex()
    if (index >= this.#sections.length - 1)
      return
    const section = this.#sections[index + 1]
    if (!section)
      throw new Error('Next EPUB section is not loaded')
    this.positionAt(this.#locator(section, 0))
  }

  async goToAnnotation(annotationId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const annotation = this.#annotations.find(candidate => candidate.id === annotationId)
    const anchor = annotation?.anchors.find(candidate => candidate.format === 'epub')
    if (!annotation || !anchor || anchor.format !== 'epub')
      throw new Error(`EPUB annotation ${annotationId} does not exist`)
    const locator = Locator.deserialize(anchor.locator)
    if (!locator)
      throw new Error(`EPUB annotation ${annotationId} contains an invalid locator`)
    this.positionAt(locator)
    this.#scrollMarkerIntoView(annotationId)
  }

  async goToOutlineItem(outlineItemId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const link = this.#outline.requireTarget(outlineItemId)
    const section = this.#sectionForHref(link.href)
    this.positionAt(this.#locator(section, 0, link.href))
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

  positionAt(locator: Locator): void {
    const section = this.#sectionForHref(locator.href)
    const progression = locator.locations.progression ?? 0
    if (!Number.isFinite(progression) || progression < 0 || progression > 1)
      throw new RangeError('EPUB locator progression must be between 0 and 1')
    const fragment = locator.locations.fragments[0]
    const fragmentElement = fragment
      ? section.content.querySelector<HTMLElement>(`#${CSS.escape(fragment.replace(/^#/, ''))}`)
      : null
    const targetTop = fragmentElement
      ? fragmentElement.getBoundingClientRect().top
      : section.root.getBoundingClientRect().top + section.root.getBoundingClientRect().height * progression
    const frameTop = this.#frame.getBoundingClientRect().top
    const top = this.#scroller.scrollTop + targetTop + frameTop - this.#scroller.getBoundingClientRect().top
      - this.#scroller.clientHeight / 2
    this.#scroller.scrollTop = Math.max(0, top)
    this.#currentLocator = locator
    this.#schedulePosition()
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    if (this.#closed)
      return
    this.#annotations = annotations
    if (this.#activated)
      this.#applyAnnotations()
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    if (!this.#closed)
      this.#regionSelection?.setEnabled(enabled)
  }

  async setScale(scale: number, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const nextScale = clampReaderScale(scale)
    if (nextScale === this.#scale)
      return
    const locator = this.#currentPosition()
    this.clearSelection()
    this.#scale = nextScale
    this.#relayout(false)
    this.positionAt(locator)
    this.#applyAnnotations()
    this.#emitState()
  }

  async #open(): Promise<void> {
    try {
      const frameDocument = this.#frame.contentDocument
      if (!frameDocument)
        throw new Error('Unable to create the continuous EPUB document')
      frameDocument.open()
      frameDocument.write('<!doctype html><html><head></head><body></body></html>')
      frameDocument.close()
      const frameHead = frameDocument.head
      const frameBody = frameDocument.body
      if (!frameHead || !frameBody)
        throw new Error('Continuous EPUB document is missing its root elements')
      const baseStyle = frameDocument.createElement('style')
      baseStyle.textContent = [
        'html,body{margin:0;padding:0;background:#f3f4f6;color:#1a1a1d;}',
        'body{box-sizing:border-box;padding:24px;}',
        '.memorilo-epub-section{position:relative;box-sizing:border-box;margin:0 auto 24px;background:#fff;box-shadow:0 2px 12px rgba(22,27,35,.14);}',
        '.memorilo-epub-content{position:relative;box-sizing:border-box;}',
        '.memorilo-epub-annotations{position:absolute;z-index:10;inset:0;overflow:hidden;pointer-events:none;}',
        '.memorilo-epub-annotation{position:absolute;margin:0;padding:0;border:0;border-radius:2px;cursor:pointer;mix-blend-mode:multiply;pointer-events:auto;}',
      ].join('')
      frameHead.append(baseStyle)
      const links = this.#parsed.publication.readingOrder.items
      const resources = await Promise.all(links.map(async (link) => {
        const type = link.type || 'application/xhtml+xml'
        const bytes = await this.#parsed.archive.readResource(link.href, type)
        return { bytes, link, type }
      }))
      this.options.signal.throwIfAborted()
      for (const resource of resources) {
        this.#sections.push(appendContinuousEpubSection(
          frameDocument,
          resource.link,
          resource.type,
          resource.bytes,
          this.#parsed.layout === 'fixed',
        ))
      }
      if (this.#sections.length === 0)
        throw new Error('EPUB does not contain a continuous reading section')
      this.#installFrameEvents(frameDocument)
      this.#relayout(false)
      this.#scope.commit()
    }
    catch (error) {
      return this.#scope.rollback(error)
    }
  }

  #applyAnnotations(): void {
    renderContinuousEpubAnnotations(
      this.#annotations,
      this.#sections,
      this.#callbacks.regionAnnotationLabel(),
    )
  }

  #currentPosition(): Locator {
    const center = this.#scroller.getBoundingClientRect().top + this.#scroller.clientHeight / 2
    let nearest = this.#sections[0]
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const section of this.#sections) {
      const rect = this.#sectionClientRect(section)
      const distance = center < rect.top ? rect.top - center : center > rect.bottom ? center - rect.bottom : 0
      if (distance < nearestDistance) {
        nearest = section
        nearestDistance = distance
      }
      if (distance === 0)
        break
    }
    if (!nearest)
      throw new Error('EPUB does not contain a current reading section')
    const rect = this.#sectionClientRect(nearest)
    const progression = rect.height <= 0 ? 0 : Math.min(1, Math.max(0, (center - rect.top) / rect.height))
    return this.#locator(nearest, progression)
  }

  #currentSectionIndex(): number {
    const href = normalizeEpubPath(this.#currentPosition().href)
    const index = this.#sections.findIndex(section => section.href === href)
    if (index < 0)
      throw new Error(`EPUB section ${href} is not loaded`)
    return index
  }

  #emitState(): void {
    if (!this.#activated || this.#closed)
      return
    this.#currentLocator = this.#currentPosition()
    const state = projectEpubReaderState({
      locator: this.#currentLocator,
      navigator: null,
      outline: this.#outline,
      pageMode: this.options.pageMode,
      parsed: this.#parsed,
      presentationMode: this.options.presentationMode,
      scale: this.#scale,
      sourceName: this.options.sourceName,
    })
    const stateKey = JSON.stringify(state)
    if (stateKey === this.#lastStateKey)
      return
    this.#lastStateKey = stateKey
    this.#callbacks.onStateChange(state)
  }

  #installFrameEvents(frameDocument: Document): void {
    const options = { signal: this.#domEvents.signal }
    frameDocument.addEventListener('pointerup', () => queueMicrotask(() => this.#captureTextSelection()), options)
    frameDocument.addEventListener('keyup', () => queueMicrotask(() => this.#captureTextSelection()), options)
    frameDocument.addEventListener('keydown', (event) => {
      if (event instanceof KeyboardEvent && this.#callbacks.onKeyDown(keyboardEventInput(event)))
        event.preventDefault()
    }, options)
    frameDocument.addEventListener('click', event => this.#handleFrameClick(event), options)
  }

  #captureTextSelection(): void {
    this.#observe(() => {
      const selection = this.#frame.contentWindow?.getSelection() ?? null
      this.#callbacks.onSelectionChange(projectEpubContinuousTextSelection(
        selection,
        this.#sections,
        this.#frame.getBoundingClientRect(),
      ))
    })
  }

  #handleFrameClick(event: Event): void {
    this.#observe(() => {
      const target = event.target
      if (!(target instanceof Element))
        return
      const annotation = target.closest<HTMLElement>('[data-annotation-id]')
      if (annotation?.dataset.annotationId) {
        this.#callbacks.onAnnotationActivate({ annotationId: annotation.dataset.annotationId })
        return
      }
      const linkElement = target.closest<HTMLAnchorElement>('a[href]')
      if (!linkElement)
        return
      const href = linkElement.getAttribute('href')
      const sectionRoot = target.closest<HTMLElement>('[data-href]')
      const sectionHref = sectionRoot?.dataset.href
      if (!href || !sectionHref || /^[a-z][a-z\d+.-]*:/i.test(href))
        return
      event.preventDefault()
      const resolved = href.startsWith('#') ? `${sectionHref}${href}` : resolveEpubPath(sectionHref, href)
      const section = this.#sectionForHref(resolved)
      this.positionAt(this.#locator(section, 0, resolved))
    })
  }

  #layoutSection(section: ContinuousEpubSection): void {
    layoutContinuousEpubSection(section, {
      availableWidth: this.#scroller.clientWidth,
      presentationMode: this.options.presentationMode,
      scale: this.#scale,
    })
  }

  #locator(section: ContinuousEpubSection, progression: number, href = section.href): Locator {
    const fragment = href.includes('#') ? href.slice(href.indexOf('#') + 1) : undefined
    return new Locator({
      href: section.href,
      locations: new LocatorLocations({
        fragments: fragment ? [fragment] : [],
        progression,
      }),
      type: section.type,
    })
  }

  #observe(operation: () => void): void {
    if (this.#closed)
      return
    try {
      operation()
    }
    catch (error) {
      this.#callbacks.onError(toReaderError(error))
    }
  }

  #publishRegionSelection(result: RegionSelectionResult | null): void {
    if (!result) {
      this.#callbacks.onSelectionChange(null)
      return
    }
    const projection = projectContinuousEpubRegionSelection(
      result,
      this.#frame.getBoundingClientRect(),
      this.#sections,
    )
    this.#callbacks.onSelectionChange({
      clientRect: projection.clientRect,
      selection: {
        anchors: [{
          format: 'epub',
          locator: serializedEpubLocator(this.#locator(projection.section, projection.progression)),
          targets: projection.targets,
          type: 'region',
        }],
        type: 'region',
      },
    })
  }

  #relayout(preservePosition: boolean): void {
    if (this.#closed || this.#sections.length === 0)
      return
    const locator = preservePosition && this.#activated ? this.#currentPosition() : null
    for (const section of this.#sections)
      this.#layoutSection(section)
    const body = this.#frame.contentDocument?.body
    if (!body)
      throw new Error('Continuous EPUB document body is unavailable')
    const height = Math.max(1, body.scrollHeight)
    if (this.#frame.style.height !== `${height}px`)
      this.#frame.style.height = `${height}px`
    if (locator)
      this.positionAt(locator)
    if (this.#activated)
      this.#applyAnnotations()
  }

  #schedulePosition = (): void => {
    if (this.#closed || this.#positionFrame !== null)
      return
    this.#positionFrame = requestAnimationFrame(() => {
      this.#positionFrame = null
      this.#emitState()
    })
  }

  #scrollMarkerIntoView(annotationId: string): void {
    const marker = this.#frame.contentDocument?.querySelector<HTMLElement>(
      `[data-annotation-id="${CSS.escape(annotationId)}"]`,
    )
    if (!marker)
      throw new Error(`EPUB annotation ${annotationId} has no rendered marker`)
    const markerRect = marker.getBoundingClientRect()
    const frameRect = this.#frame.getBoundingClientRect()
    const top = this.#scroller.scrollTop + frameRect.top - this.#scroller.getBoundingClientRect().top
      + markerRect.top - this.#scroller.clientHeight / 2
    this.#scroller.scrollTop = Math.max(0, top)
    this.#schedulePosition()
  }

  #sectionClientRect(section: ContinuousEpubSection): DOMRect {
    const local = section.root.getBoundingClientRect()
    const frame = this.#frame.getBoundingClientRect()
    return new DOMRect(frame.left + local.left, frame.top + local.top, local.width, local.height)
  }

  #sectionForHref(href: string): ContinuousEpubSection {
    const normalized = normalizeEpubPath(href)
    const section = this.#sections.find(candidate => candidate.href === normalized)
    if (!section)
      throw new Error(`EPUB section ${normalized} is outside the publication reading order`)
    return section
  }

  #closeInternals(): void {
    this.#closed = true
    this.#activated = false
    this.#resizeObserver.disconnect()
    this.#frameResizeObserver.disconnect()
    this.#domEvents.abort()
    this.#regionSelection?.destroy()
    this.#regionSelection = null
    if (this.#positionFrame !== null)
      cancelAnimationFrame(this.#positionFrame)
    this.#positionFrame = null
    this.#sections.length = 0
  }
}
