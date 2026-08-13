import type {
  ReaderAnnotation,
  ReaderComicRegionAnchor,
  ReaderPosition,
} from '../../types'
import type {
  ReaderAdapter,
  ReaderAdapterCallbacks,
  ReaderAdapterState,
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import type { ResolvedReaderSource } from '../source'
import type { ComicArchive } from './comic-archive'
import {
  combineLifecycleFailures,
  createOperationSupervisor,
  createResourceScope,
} from '@memorilo/effect-lifecycle'
import {
  assertReaderPositionFormat,
  clampReaderScale,
  readerZoomScaleCapability,
  runSingleMount,
} from '../reader-adapter'
import { ReaderOutlineProjection } from '../reader-outline'
import { openComicArchive } from './comic-archive'
import { ComicPageView } from './comic-page-view'

type ComicSource = ResolvedReaderSource & { format: 'cbr' | 'cbz' }

function pageLabel(path: string, index: number): string {
  const filename = path.split('/').at(-1)?.trim()
  return filename && filename.length > 0 ? filename : `Page ${index + 1}`
}

class ComicAdapter implements ReaderAdapter {
  private annotations: readonly ReaderAnnotation[] = []
  private destroyed = false
  private readonly finalizer = createResourceScope('Comic reader', { closeMode: 'dependent' })
  private readonly operations = createOperationSupervisor('Comic reader', { shutdown: 'interrupt' })
  private pageIndex = 0
  private readonly outline: ReaderOutlineProjection<number>
  private pageView: ComicPageView | null = null
  private scale = 1

  constructor(
    private readonly source: ComicSource,
    private readonly archive: ComicArchive,
    initialPosition: ReaderPosition | null | undefined,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {
    if (initialPosition !== null && initialPosition !== undefined) {
      assertReaderPositionFormat(initialPosition, source.format, `a ${source.format} reader`)
      if (!Number.isSafeInteger(initialPosition.pageNumber) || initialPosition.pageNumber < 1)
        throw new RangeError('Comic reading position must contain a positive page number')
      this.pageIndex = Math.min(initialPosition.pageNumber, archive.pages.length) - 1
    }
    this.outline = new ReaderOutlineProjection('comic', archive.pages.map((page, index) => ({
      children: [],
      href: `page:${index + 1}`,
      label: pageLabel(page.name, index),
      navigable: true,
      target: index,
    })), outlineItemId => new Error(`Comic outline item ${outlineItemId} does not exist`))
    this.registerFinalizers()
    this.finalizer.commit()
  }

  mount(container: HTMLElement, externalSignal?: AbortSignal): Promise<void> {
    if (this.destroyed)
      return Promise.reject(new Error('Cannot mount a destroyed comic reader'))
    if (this.pageView)
      return Promise.reject(new Error('Comic reader is already mounted'))
    return runSingleMount(
      this.operations,
      signal => this.mountReader(
        container,
        externalSignal ? AbortSignal.any([signal, externalSignal]) : signal,
      ),
      () => new Error('Comic reader is already mounted'),
    )
  }

  private async mountReader(container: HTMLElement, signal: AbortSignal): Promise<void> {
    const pageView = new ComicPageView(container, {
      callbacks: this.callbacks,
      format: this.source.format,
      onRegionSelection: (selection) => {
        try {
          this.publishRegionSelection(selection)
        }
        catch (error) {
          this.callbacks.onError(error instanceof Error ? error : new Error(String(error)))
        }
      },
    })
    this.pageView = pageView
    try {
      await this.renderPage(this.pageIndex, 'start', signal)
    }
    catch (error) {
      try {
        await pageView.close()
        if (this.pageView === pageView)
          this.pageView = null
      }
      catch (cleanupError) {
        throw combineLifecycleFailures(
          [error, cleanupError],
          'Failed to mount and close comic reader',
        )
      }
      throw error
    }
  }

  clearSelection(): void {
    if (this.destroyed)
      return
    this.setRegionSelectionEnabled(false)
    this.callbacks.onSelectionChange(null)
  }

  destroy(): Promise<void> {
    this.destroyed = true
    return this.finalizer.close()
  }

  private registerFinalizers(): void {
    this.finalizer.own({
      close: () => this.operations.close(),
      name: 'reader operations',
    })
    this.finalizer.own({
      close: () => this.pageView?.close(),
      name: 'comic page view',
    })
    this.finalizer.own({
      close: () => this.archive.close(),
      name: 'comic archive',
    })
  }

  async goBackward(entryEdge: ReaderPageEdge): Promise<void> {
    return this.operations.run(async (signal) => {
      if (this.destroyed || this.pageIndex === 0)
        return
      await this.renderPageAt(this.pageIndex - 1, entryEdge, signal)
    })
  }

  async goForward(entryEdge: ReaderPageEdge): Promise<void> {
    return this.operations.run(async (signal) => {
      if (this.destroyed || this.pageIndex >= this.archive.pages.length - 1)
        return
      await this.renderPageAt(this.pageIndex + 1, entryEdge, signal)
    })
  }

  async goToAnnotation(annotationId: string): Promise<void> {
    return this.operations.run(async (signal) => {
      const annotation = this.annotations.find(item => item.id === annotationId)
      if (!annotation || (annotation.anchor.format !== 'cbz' && annotation.anchor.format !== 'cbr'))
        throw new Error(`Comic annotation ${annotationId} does not exist`)
      if (this.destroyed)
        return
      if (!await this.renderPageAt(annotation.anchor.pageNumber - 1, 'start', signal))
        return
      this.pageView?.scrollToAnnotation(annotationId)
    })
  }

  async goToOutlineItem(outlineItemId: string): Promise<void> {
    return this.operations.run(async (signal) => {
      const index = this.outline.requireTarget(outlineItemId)
      if (this.destroyed)
        return
      await this.renderPageAt(index, 'start', signal)
    })
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    return this.pageView?.moveViewport(direction) ?? 'at-boundary'
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    if (this.destroyed)
      return
    this.annotations = annotations
    this.pageView?.setAnnotations(annotations)
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    if (this.destroyed)
      return
    this.pageView?.setRegionSelectionEnabled(enabled)
  }

  async setScale(scale: number): Promise<void> {
    return this.operations.run(async () => {
      if (this.destroyed)
        return
      const nextScale = clampReaderScale(scale)
      if (nextScale === this.scale)
        return
      this.clearSelection()
      this.pageView?.setScale(nextScale)
      this.scale = nextScale
      this.emitState()
    })
  }

  private publishRegionSelection(result: RegionSelectionResult | null): void {
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

  private async renderPage(
    pageIndex: number,
    entryEdge: ReaderPageEdge,
    signal: AbortSignal,
  ): Promise<boolean> {
    const pageView = this.pageView
    if (!pageView)
      throw new Error('Comic reader image is not mounted')
    const blob = await this.archive.readPage(pageIndex, signal)
    if (this.destroyed)
      return false
    const rendered = await pageView.render({
      annotations: () => this.annotations,
      blob,
      entryEdge,
      pageCount: this.archive.pages.length,
      pageNumber: pageIndex + 1,
      scale: this.scale,
      signal,
    })
    if (!rendered)
      return false
    this.pageIndex = pageIndex
    this.emitState()
    return true
  }

  private async renderPageAt(
    pageIndex: number,
    entryEdge: ReaderPageEdge,
    signal: AbortSignal,
  ): Promise<boolean> {
    this.clearSelection()
    return this.renderPage(pageIndex, entryEdge, signal)
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
      outline: this.outline.items,
      position: { format: this.source.format, pageNumber },
      presentationMode: 'publisher',
      scale: this.scale,
      title: this.source.name,
    }
    this.callbacks.onStateChange(state)
  }
}

export async function openComicAdapter(
  source: ComicSource,
  initialPosition: ReaderPosition | null | undefined,
  callbacks: ReaderAdapterCallbacks,
  signal?: AbortSignal,
): Promise<ReaderAdapter> {
  const archive = await openComicArchive(source, signal)
  try {
    signal?.throwIfAborted()
    return new ComicAdapter(source, archive, initialPosition, callbacks)
  }
  catch (error) {
    try {
      await archive.close()
    }
    catch (cleanupError) {
      throw combineLifecycleFailures(
        [error, cleanupError],
        'Failed to construct and close comic reader',
      )
    }
    throw error
  }
}
