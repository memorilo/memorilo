import type { ReaderAnnotation } from '../../types'
import type {
  ReaderAdapterCallbacks,
  ReaderAdapterState,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import type { TxtDocument } from './txt-document'
import type { TxtDocumentProjection } from './txt-document-projection'
import {
  combineLifecycleFailures,
  createResourceScope,
} from '@memorilo/effect-lifecycle'
import { AnnotationActivationOwner } from '../annotations'
import { readerFontSizeScaleCapability } from '../reader-adapter'
import { RegionSelectionController } from '../region-selection'
import { regionSelectionClassNames } from '../region-selection.stylex'
import { createTxtDocumentProjection } from './txt-document-projection'

const scrollStep = 48
const scrollBoundaryTolerance = 1

interface OpenTxtReaderMountOptions {
  annotations: readonly ReaderAnnotation[]
  callbacks: ReaderAdapterCallbacks
  document: TxtDocument
  initialOffset: number
  name: string
  onLayoutChange: () => void
  onStateRequest: () => void
}

interface TxtReaderDom {
  annotationLayer: HTMLDivElement
  article: HTMLElement
  content: HTMLDivElement
  regionCapture: HTMLDivElement
  scroller: HTMLDivElement
  surface: HTMLDivElement
}

function keyboardScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function createReaderDom(container: HTMLElement, name: string): TxtReaderDom {
  const surface = document.createElement('div')
  surface.className = 'reader-txt-surface'
  Object.assign(surface.style, {
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  })
  const scroller = document.createElement('div')
  scroller.tabIndex = 0
  Object.assign(scroller.style, {
    background: '#fff',
    boxSizing: 'border-box',
    height: '100%',
    overflow: 'auto',
    padding: '48px 24px 72px',
    scrollBehavior: 'auto',
    width: '100%',
  })
  const content = document.createElement('div')
  Object.assign(content.style, {
    minHeight: '100%',
    position: 'relative',
  })
  const article = document.createElement('article')
  article.setAttribute('aria-label', name)
  Object.assign(article.style, {
    color: 'rgba(26, 26, 29, 0.94)',
    fontFamily: 'ui-serif, Georgia, serif',
    fontSize: '17px',
    lineHeight: '1.72',
    margin: '0 auto',
    maxWidth: '72ch',
    overflowWrap: 'break-word',
    tabSize: '4',
    whiteSpace: 'pre-wrap',
    wordBreak: 'normal',
  })
  const annotationLayer = document.createElement('div')
  annotationLayer.className = regionSelectionClassNames.annotations
  const regionCapture = document.createElement('div')
  regionCapture.setAttribute('aria-hidden', 'true')
  content.append(article, annotationLayer)
  scroller.append(content)
  surface.append(scroller, regionCapture)
  try {
    container.append(surface)
  }
  catch (error) {
    try {
      surface.remove()
    }
    catch (cleanupError) {
      throw combineLifecycleFailures(
        [error, cleanupError],
        'Failed to attach and close TXT reader DOM',
      )
    }
    throw error
  }
  return { annotationLayer, article, content, regionCapture, scroller, surface }
}

/** Owns the mounted TXT DOM, browser resources, and document projection. */
export class TxtReaderMount {
  private keyboardScrollTarget: { direction: ReaderScrollDirection, value: number } | null = null
  private scrollFrame: number | null = null

  private constructor(
    private readonly resources: ReturnType<typeof createResourceScope>,
    private readonly callbacks: ReaderAdapterCallbacks,
    private readonly dom: TxtReaderDom,
    private readonly projection: TxtDocumentProjection,
    private readonly regionSelection: RegionSelectionController,
    private readonly name: string,
    private readonly onStateRequest: () => void,
  ) {}

  static async open(
    container: HTMLElement,
    options: OpenTxtReaderMountOptions,
  ): Promise<TxtReaderMount> {
    const resources = createResourceScope('TXT reader mount')
    let annotationActivation: AnnotationActivationOwner | null = null
    let domEvents: AbortController | null = null
    let mount: TxtReaderMount | null = null
    let regionSelection: RegionSelectionController | null = null
    let resizeObserver: ResizeObserver | null = null
    const dom = createReaderDom(container, options.name)

    resources.own({
      close: () => {
        resizeObserver?.disconnect()
        resizeObserver = null
      },
      name: 'resize observer',
    })
    resources.own({
      close: () => mount?.cancelStateFrame(),
      name: 'scroll state frame',
    })
    resources.own({
      close: () => {
        regionSelection?.destroy()
        regionSelection = null
      },
      name: 'region selection',
    })
    resources.own({
      close: () => {
        domEvents?.abort()
        domEvents = null
      },
      name: 'DOM event listeners',
    })
    resources.own({
      close: () => {
        annotationActivation?.close()
        annotationActivation = null
      },
      name: 'annotation activation listener',
    })
    resources.own({ close: () => dom.surface.remove(), name: 'reader DOM' })

    try {
      domEvents = new AbortController()
      const listenerOptions = { signal: domEvents.signal }
      dom.article.addEventListener(
        'pointerup',
        () => queueMicrotask(() => mount?.captureSelection()),
        listenerOptions,
      )
      dom.article.addEventListener(
        'keyup',
        () => queueMicrotask(() => mount?.captureSelection()),
        listenerOptions,
      )
      dom.scroller.addEventListener('scroll', () => mount?.scheduleState(), listenerOptions)

      regionSelection = new RegionSelectionController({
        onEnabledChange: options.callbacks.onRegionSelectionModeChange,
        onSelection: (selection) => {
          try {
            mount?.publishRegionSelection(selection)
          }
          catch (error) {
            options.callbacks.onError(error instanceof Error ? error : new Error(String(error)))
          }
        },
      })
      regionSelection.mount(dom.surface, dom.regionCapture)
      annotationActivation = new AnnotationActivationOwner(
        dom.content,
        annotationId => options.callbacks.onAnnotationActivate({ annotationId }),
        {
          canActivate: () => dom.content.ownerDocument.getSelection()?.isCollapsed !== false,
        },
      )
      const projection = createTxtDocumentProjection(
        options.document,
        dom,
        options.callbacks.regionAnnotationLabel,
      )
      mount = new TxtReaderMount(
        resources,
        options.callbacks,
        dom,
        projection,
        regionSelection,
        options.name,
        options.onStateRequest,
      )
      resizeObserver = new ResizeObserver(options.onLayoutChange)
      resizeObserver.observe(dom.scroller)
      projection.setAnnotations(options.annotations)
      projection.restoreOffset(options.initialOffset)
      resources.commit()
      return mount
    }
    catch (error) {
      return resources.rollback(error)
    }
  }

  clearSelection(): void {
    this.regionSelection.setEnabled(false)
    const selection = document.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      if (this.dom.article.contains(range.commonAncestorContainer))
        selection.removeAllRanges()
    }
    this.callbacks.onSelectionChange(null)
  }

  close(): Promise<void> {
    return this.resources.close()
  }

  goToAnnotation(annotationId: string): void {
    const marker = this.dom.content.querySelector<HTMLElement>(
      `[data-annotation-id="${CSS.escape(annotationId)}"]`,
    )
    if (!marker)
      throw new Error(`TXT annotation ${annotationId} is outside the document`)
    marker.scrollIntoView({ behavior: keyboardScrollBehavior(), block: 'center' })
  }

  movePage(direction: -1 | 1): void {
    const maximum = Math.max(0, this.dom.scroller.scrollHeight - this.dom.scroller.clientHeight)
    const amount = Math.max(1, this.dom.scroller.clientHeight * 0.9)
    const next = Math.min(maximum, Math.max(0, this.dom.scroller.scrollTop + direction * amount))
    this.keyboardScrollTarget = null
    this.dom.scroller.scrollTo({ behavior: keyboardScrollBehavior(), top: next })
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    const vertical = direction === 'down' || direction === 'up'
    if (!vertical)
      return 'at-boundary'
    const current = this.dom.scroller.scrollTop
    const maximum = Math.max(0, this.dom.scroller.scrollHeight - this.dom.scroller.clientHeight)
    const boundary = direction === 'down' ? maximum : 0
    if (maximum <= scrollBoundaryTolerance || Math.abs(boundary - current) <= scrollBoundaryTolerance) {
      this.keyboardScrollTarget = null
      return 'at-boundary'
    }
    const delta = direction === 'down' ? scrollStep : -scrollStep
    const base = this.keyboardScrollTarget?.direction === direction
      ? this.keyboardScrollTarget.value
      : current
    const next = Math.min(maximum, Math.max(0, base + delta))
    this.keyboardScrollTarget = { direction, value: next }
    this.dom.scroller.scrollTo({ behavior: keyboardScrollBehavior(), top: next })
    return 'scrolled'
  }

  readerState(scale: number): ReaderAdapterState {
    const maximum = Math.max(0, this.dom.scroller.scrollHeight - this.dom.scroller.clientHeight)
    const scrollTop = this.dom.scroller.scrollTop
    const pageHeight = Math.max(1, this.dom.scroller.clientHeight * 0.9)
    const total = Math.max(1, Math.ceil(maximum / pageHeight) + 1)
    const position = Math.min(total, Math.floor(scrollTop / pageHeight) + 1)
    return {
      canGoBackward: scrollTop > scrollBoundaryTolerance,
      canGoForward: maximum - scrollTop > scrollBoundaryTolerance,
      capabilities: {
        annotations: true,
        regionSelection: true,
        scale: readerFontSizeScaleCapability,
        textSelection: true,
      },
      format: 'txt',
      location: {
        format: 'txt',
        label: `Page ${position} of ${total}`,
        position,
        progression: maximum === 0 ? 1 : scrollTop / maximum,
        total,
      },
      outline: [],
      position: { format: 'txt', offset: this.projection.currentOffset() },
      presentationMode: 'reader',
      scale,
      title: this.name,
    }
  }

  refreshLayout(): void {
    this.projection.refreshRegionAnnotations()
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    this.projection.setAnnotations(annotations)
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    this.regionSelection.setEnabled(enabled)
  }

  setScale(scale: number): void {
    this.dom.article.style.fontSize = `${17 * scale}px`
    this.projection.refreshRegionAnnotations()
  }

  private cancelStateFrame(): void {
    if (this.scrollFrame !== null)
      cancelAnimationFrame(this.scrollFrame)
    this.scrollFrame = null
  }

  private captureSelection(): void {
    const result = this.projection.captureSelection(document.getSelection())
    if (result !== undefined)
      this.callbacks.onSelectionChange(result)
  }

  private publishRegionSelection(result: RegionSelectionResult | null): void {
    if (!result) {
      this.callbacks.onSelectionChange(null)
      return
    }
    this.callbacks.onSelectionChange(this.projection.regionSelection(result.clientRect))
  }

  private scheduleState(): void {
    if (this.resources.isClosed() || this.scrollFrame !== null)
      return
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null
      if (!this.resources.isClosed())
        this.onStateRequest()
    })
  }
}
