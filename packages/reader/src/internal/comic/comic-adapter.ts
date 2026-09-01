import type {
  ReaderAnnotation,
  ReaderComicRegionAnchor,
  ReaderPageMode,
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
  toReaderError,
} from '../reader-adapter'
import { ReaderOutlineProjection } from '../reader-outline'
import { openComicArchive } from './comic-archive'
import { ComicContinuousReaderMount } from './comic-continuous-reader-mount'
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
  private pageProgress = 0
  private readonly outline: ReaderOutlineProjection<number>
  private pageView: ComicContinuousReaderMount | ComicPageView | null = null
  private scale = 1

  constructor(
    private readonly source: ComicSource,
    private readonly archive: ComicArchive,
    private readonly pageMode: ReaderPageMode,
    initialPosition: ReaderPosition | null | undefined,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {
    if (initialPosition !== null && initialPosition !== undefined) {
      assertReaderPositionFormat(initialPosition, source.format, `a ${source.format} reader`)
      if (!Number.isSafeInteger(initialPosition.pageNumber) || initialPosition.pageNumber < 1)
        throw new RangeError('Comic reading position must contain a positive page number')
      this.pageIndex = Math.min(initialPosition.pageNumber, archive.pages.length) - 1
      this.pageProgress = initialPosition.pageProgress
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
    const reportError = (error: unknown): void => this.callbacks.onError(toReaderError(error))
    if (this.pageMode === 'continuous') {
      const mount = await ComicContinuousReaderMount.open(container, this.archive, {
        annotations: this.annotations,
        callbacks: this.callbacks,
        format: this.source.format,
        initialPosition: {
          format: this.source.format,
          pageNumber: this.pageIndex + 1,
          pageProgress: this.pageProgress,
        },
        name: this.source.name,
        onPositionChange: (pageNumber, pageProgress) => {
          this.pageIndex = pageNumber - 1
          this.pageProgress = pageProgress
          if (this.pageView)
            this.emitState()
        },
        onRegionSelection: (pageNumber, selection) => {
          try {
            this.publishRegionSelection(pageNumber - 1, selection)
          }
          catch (error) {
            reportError(error)
          }
        },
        scale: this.scale,
        signal,
      })
      try {
        signal.throwIfAborted()
        this.pageView = mount
        mount.positionAt(this.pageIndex + 1, this.pageProgress)
        this.emitState()
        return
      }
      catch (error) {
        try {
          await mount.close()
        }
        catch (cleanupError) {
          throw combineLifecycleFailures(
            [error, cleanupError],
            'Failed to mount and close continuous comic reader',
          )
        }
        throw error
      }
    }
    const pageView = new ComicPageView(container, {
      callbacks: this.callbacks,
      format: this.source.format,
      onRegionSelection: (selection) => {
        try {
          this.publishRegionSelection(this.pageIndex, selection)
        }
        catch (error) {
          reportError(error)
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

  goBackward(entryEdge: ReaderPageEdge): Promise<void> {
    return this.operations.run(async (signal) => {
      if (this.destroyed || this.pageIndex === 0)
        return
      await this.renderPageAt(this.pageIndex - 1, entryEdge, signal)
    })
  }

  goForward(entryEdge: ReaderPageEdge): Promise<void> {
    return this.operations.run(async (signal) => {
      if (this.destroyed || this.pageIndex >= this.archive.pages.length - 1)
        return
      await this.renderPageAt(this.pageIndex + 1, entryEdge, signal)
    })
  }

  goToAnnotation(annotationId: string): Promise<void> {
    return this.operations.run(async (signal) => {
      const annotation = this.annotations.find(item => item.id === annotationId)
      const anchor = annotation?.anchors[0]
      if (!annotation || !anchor || (anchor.format !== 'cbz' && anchor.format !== 'cbr'))
        throw new Error(`Comic annotation ${annotationId} does not exist`)
      if (this.destroyed)
        return
      if (!await this.renderPageAt(anchor.pageNumber - 1, 'start', signal))
        return
      await this.pageView?.scrollToAnnotation(annotationId)
    })
  }

  goToOutlineItem(outlineItemId: string): Promise<void> {
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

  setScale(scale: number): Promise<void> {
    return this.operations.run(async () => {
      if (this.destroyed)
        return
      const nextScale = clampReaderScale(scale)
      if (nextScale === this.scale)
        return
      this.clearSelection()
      this.pageView?.setScale(nextScale)
      if (this.pageMode === 'continuous')
        (this.pageView as ComicContinuousReaderMount | null)?.positionAt(this.pageIndex + 1, this.pageProgress)
      this.scale = nextScale
      this.emitState()
    })
  }

  private publishRegionSelection(pageIndex: number, result: RegionSelectionResult | null): void {
    if (!result) {
      this.callbacks.onSelectionChange(null)
      return
    }
    const anchor: ReaderComicRegionAnchor = {
      format: this.source.format,
      pageNumber: pageIndex + 1,
      rect: result.rect,
      type: 'region',
    }
    this.callbacks.onSelectionChange({
      clientRect: result.clientRect,
      selection: { anchors: [anchor], type: 'region' },
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
    if (this.pageMode === 'continuous') {
      const continuousMount = pageView as ComicContinuousReaderMount
      if (!await continuousMount.ensurePage(pageIndex + 1, signal))
        return false
      if (this.destroyed)
        return false
      this.pageIndex = pageIndex
      this.pageProgress = entryEdge === 'start' ? 0 : 1
      continuousMount.positionAt(pageIndex + 1, this.pageProgress)
      this.emitState()
      return true
    }
    const blob = await this.archive.readPage(pageIndex, signal)
    if (this.destroyed)
      return false
    const rendered = await (pageView as ComicPageView).render({
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
    this.pageProgress = 0
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
      pageMode: this.pageMode,
      position: { format: this.source.format, pageNumber, pageProgress: this.pageProgress },
      presentationMode: 'publisher',
      scale: this.scale,
      title: this.source.name,
    }
    this.callbacks.onStateChange(state)
  }
}

export async function openComicAdapter(
  source: ComicSource,
  pageMode: ReaderPageMode,
  initialPosition: ReaderPosition | null | undefined,
  callbacks: ReaderAdapterCallbacks,
  signal?: AbortSignal,
): Promise<ReaderAdapter> {
  const archive = await openComicArchive(source, signal)
  try {
    signal?.throwIfAborted()
    return new ComicAdapter(source, archive, pageMode, initialPosition, callbacks)
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
