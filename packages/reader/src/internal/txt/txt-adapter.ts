import type {
  ReaderAnnotation,
  ReaderPageMode,
  ReaderPosition,
} from '../../types'
import type {
  ReaderAdapter,
  ReaderAdapterCallbacks,
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { ResolvedReaderSource } from '../source'
import type { TxtDocument } from './txt-document'
import {
  combineLifecycleFailures,
  createOperationSupervisor,
  createResourceScope,
} from '@memorilo/effect-lifecycle'
import {
  assertReaderPositionFormat,
  clampReaderScale,
  runSingleMount,
  toReaderError,
} from '../reader-adapter'
import { readSourceBytes } from '../source'
import { decodeTxtDocument } from './txt-document'
import { TxtReaderMount } from './txt-reader-mount'

type TxtSource = ResolvedReaderSource & { format: 'txt' }

class TxtAdapter implements ReaderAdapter {
  private annotations: readonly ReaderAnnotation[] = []
  private destroyed = false
  private readonly finalizer = createResourceScope('TXT reader')
  private readonly initialOffset: number
  private mounted: TxtReaderMount | null = null
  private readonly operations = createOperationSupervisor('TXT reader')
  private scale = 1

  constructor(
    private readonly source: TxtSource,
    private readonly document: TxtDocument,
    private readonly pageMode: ReaderPageMode,
    initialPosition: ReaderPosition | null | undefined,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {
    if (initialPosition !== null && initialPosition !== undefined) {
      assertReaderPositionFormat(initialPosition, 'txt', 'a TXT reader')
      if (!Number.isSafeInteger(initialPosition.offset) || initialPosition.offset < 0)
        throw new RangeError('TXT reading position must contain a non-negative character offset')
    }
    this.initialOffset = initialPosition?.format === 'txt'
      ? Math.min(initialPosition.offset, document.length)
      : 0
    this.finalizer.own({ close: () => this.operations.close(), name: 'reader operations' })
    this.finalizer.own({
      close: async () => {
        const mount = this.mounted
        await mount?.close()
        if (this.mounted === mount)
          this.mounted = null
      },
      name: 'TXT reader mount',
    })
    this.finalizer.commit()
  }

  mount(container: HTMLElement, externalSignal?: AbortSignal): Promise<void> {
    if (this.destroyed)
      return Promise.reject(new Error('Cannot mount a destroyed TXT reader'))
    if (this.mounted)
      return Promise.reject(new Error('TXT reader is already mounted'))
    return runSingleMount(
      this.operations,
      signal => this.mountReader(
        container,
        externalSignal ? AbortSignal.any([signal, externalSignal]) : signal,
      ),
      () => new Error('TXT reader is already mounted'),
    )
  }

  clearSelection(): void {
    if (!this.destroyed)
      this.mounted?.clearSelection()
  }

  destroy(): Promise<void> {
    this.destroyed = true
    return this.finalizer.close()
  }

  goBackward(_entryEdge: ReaderPageEdge): Promise<void> {
    return this.operations.run(async () => {
      if (!this.destroyed)
        this.mounted?.movePage(-1)
    })
  }

  goForward(_entryEdge: ReaderPageEdge): Promise<void> {
    return this.operations.run(async () => {
      if (!this.destroyed)
        this.mounted?.movePage(1)
    })
  }

  goToAnnotation(annotationId: string): Promise<void> {
    return this.operations.run(async () => {
      const annotation = this.annotations.find(item => item.id === annotationId)
      if (!annotation || annotation.anchors[0].format !== 'txt')
        throw new Error(`TXT annotation ${annotationId} does not exist`)
      if (!this.destroyed)
        this.mounted?.goToAnnotation(annotationId)
    })
  }

  moveViewport(direction: ReaderScrollDirection): ReaderScrollResult {
    return this.destroyed ? 'at-boundary' : (this.mounted?.moveViewport(direction) ?? 'at-boundary')
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    if (this.destroyed)
      return
    this.annotations = annotations
    this.mounted?.setAnnotations(annotations)
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    if (!this.destroyed)
      this.mounted?.setRegionSelectionEnabled(enabled)
  }

  setScale(scale: number): Promise<void> {
    return this.operations.run(async () => {
      if (this.destroyed)
        return
      const nextScale = clampReaderScale(scale)
      if (nextScale === this.scale)
        return
      this.clearSelection()
      this.mounted?.setScale(nextScale)
      this.scale = nextScale
      this.emitState()
    })
  }

  private emitState(): void {
    if (!this.destroyed && this.mounted)
      this.callbacks.onStateChange(this.mounted.readerState(this.scale, this.pageMode))
  }

  private handleLayoutChange(): void {
    if (this.destroyed)
      return
    void this.operations.run(async () => {
      if (this.destroyed || !this.mounted)
        return
      this.mounted.refreshLayout()
      this.emitState()
    }).then(
      () => undefined,
      (error) => {
        if (!this.destroyed)
          this.callbacks.onError(toReaderError(error))
      },
    )
  }

  private async mountReader(container: HTMLElement, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const mount = await TxtReaderMount.open(container, {
      annotations: this.annotations,
      callbacks: this.callbacks,
      document: this.document,
      initialOffset: this.initialOffset,
      name: this.source.name,
      onLayoutChange: () => this.handleLayoutChange(),
      onStateRequest: () => this.emitState(),
      pageMode: this.pageMode,
    })
    try {
      signal.throwIfAborted()
      this.mounted = mount
      this.emitState()
    }
    catch (error) {
      if (this.mounted === mount)
        this.mounted = null
      try {
        await mount.close()
      }
      catch (cleanupError) {
        throw combineLifecycleFailures(
          [error, cleanupError],
          'Failed to mount and close TXT reader',
        )
      }
      throw error
    }
  }
}

export async function openTxtAdapter(
  source: TxtSource,
  pageMode: ReaderPageMode,
  initialPosition: ReaderPosition | null | undefined,
  callbacks: ReaderAdapterCallbacks,
  signal?: AbortSignal,
): Promise<ReaderAdapter> {
  const bytes = await readSourceBytes(source, signal)
  signal?.throwIfAborted()
  return new TxtAdapter(source, decodeTxtDocument(bytes), pageMode, initialPosition, callbacks)
}
