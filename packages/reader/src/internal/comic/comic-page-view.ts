import type { LatestOperationContext } from '@memorilo/effect-lifecycle'
import type { ReaderAnnotation } from '../../types'
import type {
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { ComicPageSurfaceOptions } from './comic-page-surface'
import {
  combineLifecycleFailures,
  createLatestOperationSupervisor,
  createResourceScope,
} from '@memorilo/effect-lifecycle'
import { interruptPromise } from '../interrupt-promise'
import { ComicPageSurface } from './comic-page-surface'

interface ComicPageRenderInput {
  annotations: () => readonly ReaderAnnotation[]
  blob: Blob
  entryEdge: ReaderPageEdge
  pageCount: number
  pageNumber: number
  scale: number
  signal: AbortSignal
}

/** Owns async comic decode admission while ComicPageSurface owns browser resources. */
export class ComicPageView {
  private readonly renders = createLatestOperationSupervisor<'page'>('Comic page view rendering', {
    abortReason: () => new Error('Comic page view closed'),
    closedError: () => new Error('Comic page view closed'),
    concurrency: 'parallel',
    shutdown: 'interrupt',
  })

  private readonly resources = createResourceScope('Comic page view', {
    closeMode: 'dependent',
  })

  private readonly surface: ComicPageSurface

  constructor(container: HTMLElement, options: ComicPageSurfaceOptions) {
    this.surface = new ComicPageSurface(container, options)
    this.resources.own({ close: this.renders.close, name: 'render operations' })
    this.resources.own({ close: () => this.surface.close(), name: 'page surface' })
    this.resources.commit()
  }

  close(): Promise<void> {
    return this.resources.close()
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    return this.surface.moveViewport(direction)
  }

  render(input: ComicPageRenderInput): Promise<boolean> {
    if (this.resources.isClosed())
      return Promise.resolve(false)
    return this.renders.run('page', attempt => this.#renderOwned(input, attempt)).then(
      result => result.status === 'current' && result.value,
    )
  }

  scrollToAnnotation(annotationId: string): void {
    this.surface.scrollToAnnotation(annotationId)
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    this.surface.setAnnotations(annotations)
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    this.surface.setRegionSelectionEnabled(enabled)
  }

  setScale(scale: number): void {
    this.surface.setScale(scale)
  }

  async #renderOwned(
    input: ComicPageRenderInput,
    attempt: LatestOperationContext,
  ): Promise<boolean> {
    const signal = AbortSignal.any([input.signal, attempt.signal])
    let stagedObjectUrl: string | null = null
    try {
      signal.throwIfAborted()
      stagedObjectUrl = this.surface.createObjectUrl(input.blob)

      let stagedImage: HTMLImageElement
      try {
        stagedImage = this.surface.createImage(stagedObjectUrl, input.pageNumber, input.pageCount)
        await interruptPromise(stagedImage.decode(), signal)
      }
      catch (error) {
        const failure = signal.aborted
          ? signal.reason
          : new Error(`Unable to decode comic page ${input.pageNumber}`, { cause: error })
        const failedObjectUrl = stagedObjectUrl
        stagedObjectUrl = null
        try {
          this.surface.releaseObjectUrl(failedObjectUrl)
        }
        catch (cleanupError) {
          throw combineLifecycleFailures(
            [failure, cleanupError],
            `Failed to decode and release comic page ${input.pageNumber}`,
          )
        }
        throw failure
      }

      if (this.resources.isClosed() || !attempt.isCurrent()) {
        const staleObjectUrl = stagedObjectUrl
        stagedObjectUrl = null
        this.surface.releaseObjectUrl(staleObjectUrl)
        return false
      }

      this.surface.commit(
        stagedImage,
        stagedObjectUrl,
        input.annotations(),
        input.pageNumber,
        input.scale,
        input.entryEdge,
      )
      stagedObjectUrl = null
      return true
    }
    catch (error) {
      const failedObjectUrl = stagedObjectUrl
      stagedObjectUrl = null
      if (failedObjectUrl) {
        try {
          this.surface.releaseObjectUrl(failedObjectUrl)
        }
        catch (cleanupError) {
          throw combineLifecycleFailures(
            [error, cleanupError],
            'Failed to release staged comic page',
          )
        }
      }
      throw error
    }
  }
}
