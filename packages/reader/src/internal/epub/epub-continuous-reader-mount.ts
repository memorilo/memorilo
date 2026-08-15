import type { Link } from '@readium/shared'
import type {
  ReaderAnnotation,
  ReaderEpubRegionTarget,
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
import type { ParsedEpub } from './epub-parser'
import { createResourceScope } from '@memorilo/effect-lifecycle'
import { Layout, Locator, LocatorLocations } from '@readium/shared'
import { annotationOverlayTint } from '../annotations'
import { normalizedRectWithinSurface } from '../fixed-page/geometry'
import { clampReaderScale, toReaderError } from '../reader-adapter'
import { RegionSelectionController } from '../region-selection'
import { epubOutline, serializedEpubLocator } from './epub-content-projection'
import {
  epubContinuousTextOffsets,
  epubContinuousTextRange,
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

interface ContinuousEpubSection {
  annotationLayer: HTMLDivElement
  content: HTMLElement
  fixed: boolean
  href: string
  link: Link
  naturalHeight: number
  naturalWidth: number
  root: HTMLElement
  type: string
}

const scrollStep = 48
const scrollTolerance = 1

function parserType(mediaType: string): DOMParserSupportedType {
  return mediaType === 'text/html' ? 'text/html' : 'application/xhtml+xml'
}

function viewportSize(document: Document): { height: number, width: number } {
  const value = document.querySelector('meta[name="viewport" i]')?.getAttribute('content') ?? ''
  const width = /(?:^|,)\s*width\s*=\s*([\d.]+)/i.exec(value)?.[1]
  const height = /(?:^|,)\s*height\s*=\s*([\d.]+)/i.exec(value)?.[1]
  const parsedWidth = Number(width)
  const parsedHeight = Number(height)
  return {
    height: Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 768,
    width: Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 1024,
  }
}

function intersectionRect(left: DOMRectReadOnly, right: DOMRectReadOnly): DOMRect | null {
  const x = Math.max(left.left, right.left)
  const y = Math.max(left.top, right.top)
  const width = Math.max(0, Math.min(left.right, right.right) - x)
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - y)
  return width > 0 && height > 0 ? new DOMRect(x, y, width, height) : null
}

function isAnchorableElement(element: Element): boolean {
  if (['canvas', 'img', 'picture', 'svg', 'video'].includes(element.localName))
    return true
  return [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
}

function stableSelector(root: HTMLElement, element: Element): string {
  if (!root.contains(element))
    throw new Error('EPUB region target is outside its spine section')
  if (element.id) {
    const byId = `#${CSS.escape(element.id)}`
    if (root.querySelectorAll(byId).length === 1)
      return byId
  }
  const segments: string[] = []
  let current: Element | null = element
  while (current && current !== root) {
    const name = CSS.escape(current.localName)
    const siblings = current.parentElement
      ? [...current.parentElement.children].filter(sibling => sibling.localName === current!.localName)
      : [current]
    segments.unshift(`${name}:nth-of-type(${siblings.indexOf(current) + 1})`)
    current = current.parentElement
  }
  if (current !== root || segments.length === 0)
    throw new Error('Unable to create an EPUB region target selector')
  const selector = segments.join(' > ')
  if (root.querySelectorAll(selector).length !== 1)
    throw new Error('Unable to create a stable EPUB region target selector')
  return selector
}

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
      for (const resource of resources)
        this.#sections.push(this.#appendSection(frameDocument, resource.link, resource.type, resource.bytes))
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

  #appendSection(
    frameDocument: Document,
    link: Link,
    type: string,
    bytes: Uint8Array,
  ): ContinuousEpubSection {
    const source = new DOMParser().parseFromString(new TextDecoder().decode(bytes), parserType(type))
    if (source.querySelector('parsererror'))
      throw new Error(`Invalid EPUB content document ${link.href}`)
    const fixed = this.#parsed.layout === 'fixed'
      || link.properties?.otherProperties.layout === Layout.fixed
    const size = viewportSize(source)
    const root = frameDocument.createElement('section')
    root.className = 'memorilo-epub-section'
    root.dataset.href = normalizeEpubPath(link.href)
    const content = frameDocument.createElement('div')
    content.className = 'memorilo-epub-content'
    content.dataset.href = normalizeEpubPath(link.href)
    const sourceBody = source.body ?? source.documentElement
    content.classList.add(...sourceBody.classList)
    const bodyStyle = sourceBody.getAttribute('style')
    if (bodyStyle)
      content.style.cssText += bodyStyle
    for (const child of [...sourceBody.childNodes])
      content.append(frameDocument.importNode(child, true))
    for (const stylesheet of [...source.querySelectorAll('style, link[rel~="stylesheet" i]')])
      root.prepend(frameDocument.importNode(stylesheet, true))
    const annotationLayer = frameDocument.createElement('div')
    annotationLayer.className = 'memorilo-epub-annotations'
    root.append(content, annotationLayer)
    frameDocument.body.append(root)
    return {
      annotationLayer,
      content,
      fixed,
      href: normalizeEpubPath(link.href),
      link,
      naturalHeight: size.height,
      naturalWidth: size.width,
      root,
      type,
    }
  }

  #applyAnnotations(): void {
    for (const section of this.#sections)
      section.annotationLayer.replaceChildren()
    for (const annotation of this.#annotations) {
      for (const anchor of annotation.anchors) {
        if (anchor.format !== 'epub')
          continue
        const section = this.#sections.find(candidate => candidate.href === normalizeEpubPath(anchor.locator.href))
        if (!section)
          continue
        if (anchor.type === 'text') {
          const offsets = epubContinuousTextOffsets(anchor, section.content)
          const range = epubContinuousTextRange(section.content, offsets.start, offsets.end)
          for (const rect of [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0))
            section.annotationLayer.append(this.#annotationMarker(annotation, section, rect))
          continue
        }
        for (const target of anchor.targets) {
          const element = section.content.querySelector(target.selector)
          if (!element)
            continue
          const elementRect = element.getBoundingClientRect()
          const rect = new DOMRect(
            elementRect.left + target.rect.x * elementRect.width,
            elementRect.top + target.rect.y * elementRect.height,
            target.rect.width * elementRect.width,
            target.rect.height * elementRect.height,
          )
          section.annotationLayer.append(this.#annotationMarker(annotation, section, rect))
        }
      }
    }
  }

  #annotationMarker(
    annotation: ReaderAnnotation,
    section: ContinuousEpubSection,
    rect: DOMRectReadOnly,
  ): HTMLButtonElement {
    const marker = section.root.ownerDocument.createElement('button')
    marker.className = 'memorilo-epub-annotation'
    marker.dataset.annotationId = annotation.id
    marker.setAttribute('aria-label', this.#callbacks.regionAnnotationLabel())
    marker.type = 'button'
    const sectionRect = section.root.getBoundingClientRect()
    const tint = annotationOverlayTint(annotation.color)
    Object.assign(marker.style, {
      background: annotation.style === 'highlight' ? tint : 'transparent',
      borderBottom: annotation.style === 'underline' ? `2px solid ${tint}` : '0',
      height: `${rect.height}px`,
      left: `${rect.left - sectionRect.left}px`,
      top: `${rect.top - sectionRect.top}px`,
      width: `${rect.width}px`,
    })
    return marker
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
    if (section.fixed) {
      const availableWidth = Math.max(1, this.#scroller.clientWidth - 48)
      const fitScale = Math.min(1, availableWidth / section.naturalWidth)
      const scale = fitScale * this.#scale
      section.content.style.width = `${section.naturalWidth}px`
      section.content.style.height = `${section.naturalHeight}px`
      section.content.style.transform = `scale(${scale})`
      section.content.style.transformOrigin = '0 0'
      section.root.style.width = `${Math.max(1, Math.round(section.naturalWidth * scale))}px`
      section.root.style.height = `${Math.max(1, Math.round(section.naturalHeight * scale))}px`
      section.root.style.padding = '0'
      section.root.style.overflow = 'hidden'
      return
    }
    const fontScale = this.options.presentationMode === 'reader' ? this.#scale : 1
    section.content.style.fontSize = `${fontScale}em`
    section.content.style.lineHeight = this.options.presentationMode === 'reader' ? '1.5' : ''
    section.content.style.maxWidth = this.options.presentationMode === 'reader' ? '72ch' : 'none'
    section.content.style.margin = '0 auto'
    section.root.style.width = 'min(100%, 960px)'
    section.root.style.height = 'auto'
    section.root.style.padding = '48px clamp(24px, 6vw, 72px)'
    section.root.style.overflow = 'visible'
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
    const frameRect = this.#frame.getBoundingClientRect()
    const localRect = new DOMRect(
      result.clientRect.left - frameRect.left,
      result.clientRect.top - frameRect.top,
      result.clientRect.width,
      result.clientRect.height,
    )
    const section = this.#sections.find(candidate => intersectionRect(localRect, candidate.root.getBoundingClientRect()))
    if (!section)
      throw new Error('EPUB area selection does not intersect a spine section')
    const candidates = [...section.content.querySelectorAll('*')].filter((element) => {
      if (!isAnchorableElement(element))
        return false
      return intersectionRect(localRect, element.getBoundingClientRect()) !== null
    })
    const media = candidates.filter(element => ['canvas', 'img', 'picture', 'svg', 'video'].includes(element.localName))
    const preferred = media.length > 0 ? media : candidates
    const targets: ReaderEpubRegionTarget[] = preferred
      .filter(element => !preferred.some(other => other !== element && other.contains(element)))
      .map((element) => {
        const elementRect = element.getBoundingClientRect()
        const overlap = intersectionRect(localRect, elementRect)
        const rect = overlap && normalizedRectWithinSurface(overlap, elementRect)
        if (!rect)
          throw new Error('EPUB area selection produced an invalid content rectangle')
        return { rect, selector: stableSelector(section.content, element) }
      })
    if (targets.length === 0)
      throw new Error('EPUB area selection does not intersect anchorable content')
    const sectionRect = section.root.getBoundingClientRect()
    const progression = sectionRect.height <= 0
      ? 0
      : Math.min(1, Math.max(0, (localRect.top - sectionRect.top) / sectionRect.height))
    this.#callbacks.onSelectionChange({
      clientRect: result.clientRect,
      selection: {
        anchors: [{
          format: 'epub',
          locator: serializedEpubLocator(this.#locator(section, progression)),
          targets,
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
