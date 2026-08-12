import type {
  ReaderAnnotation,
  ReaderPosition,
  ReaderPresentationMode,
} from '../../types'
import type {
  ReaderAdapter,
  ReaderAdapterCallbacks,
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'
import type { ResolvedReaderSource } from '../source'
import type { ParsedEpub } from './epub-parser'
import {
  combineLifecycleFailures,
  createOperationSupervisor,
  createResourceScope,
} from '@memorilo/effect-lifecycle'
import { Locator } from '@readium/shared'
import { assertReaderPositionFormat, runSingleMount } from '../reader-adapter'
import { parseEpub } from './epub-parser'
import { EpubReaderMount } from './epub-reader-mount'
import './epub-layer.css'

type EpubSource = ResolvedReaderSource & { format: 'epub' }

class EpubAdapter implements ReaderAdapter {
  private annotations: readonly ReaderAnnotation[] = []
  private destroyed = false
  private readonly finalizer = createResourceScope('EPUB reader', { closeMode: 'dependent' })
  private readonly initialLocator: Locator
  private mounted: EpubReaderMount | null = null
  private readonly operations = createOperationSupervisor('EPUB reader', { shutdown: 'interrupt' })
  private readonly presentationMode: ReaderPresentationMode
  readonly setScale?: (scale: number) => Promise<void>

  constructor(
    private readonly source: EpubSource,
    private readonly parsed: ParsedEpub,
    initialPresentationMode: ReaderPresentationMode,
    initialPosition: ReaderPosition | null | undefined,
    private readonly callbacks: ReaderAdapterCallbacks,
  ) {
    this.presentationMode = parsed.layout === 'reflowable' ? initialPresentationMode : 'publisher'
    if (parsed.layout === 'reflowable') {
      this.setScale = scale => this.operations.run(
        signal => this.requireMount().setScale(scale, signal),
      )
    }
    if (initialPosition !== null && initialPosition !== undefined)
      assertReaderPositionFormat(initialPosition, 'epub', 'an EPUB reader')
    const restoredLocator = initialPosition?.format === 'epub'
      ? Locator.deserialize(initialPosition.locator)
      : undefined
    const initialLocator = restoredLocator && parsed.publication.readingOrder.items
      .some(item => item.href === restoredLocator.href)
      ? restoredLocator
      : parsed.positions[0]
    if (!initialLocator)
      throw new Error('EPUB does not contain a readable spine position')
    this.initialLocator = initialLocator
    this.registerFinalizers()
    this.finalizer.commit()
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
    return this.operations.run(signal => this.requireMount().goBackward(signal))
  }

  goForward(_entryEdge: ReaderPageEdge): Promise<void> {
    return this.operations.run(signal => this.requireMount().goForward(signal))
  }

  goToAnnotation(annotationId: string): Promise<void> {
    return this.operations.run(
      signal => this.requireMount().goToAnnotation(annotationId, signal),
    )
  }

  goToOutlineItem(outlineItemId: string): Promise<void> {
    return this.operations.run(
      signal => this.requireMount().goToOutlineItem(outlineItemId, signal),
    )
  }

  mount(container: HTMLElement, externalSignal?: AbortSignal): Promise<void> {
    if (this.destroyed)
      return Promise.reject(new Error('Cannot mount a destroyed EPUB reader'))
    if (this.mounted)
      return Promise.reject(new Error('EPUB reader is already mounted'))
    return runSingleMount(
      this.operations,
      signal => this.mountReader(
        container,
        externalSignal ? AbortSignal.any([signal, externalSignal]) : signal,
      ),
      () => new Error('EPUB reader is already mounted'),
    )
  }

  moveViewport(_direction: ReaderScrollDirection): ReaderScrollResult {
    if (this.destroyed)
      throw new Error('EPUB reader is not available')
    return 'at-boundary'
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

  private async mountReader(container: HTMLElement, signal: AbortSignal): Promise<void> {
    const mounted = new EpubReaderMount({
      annotations: this.annotations,
      callbacks: this.callbacks,
      container,
      initialLocator: this.initialLocator,
      parsed: this.parsed,
      presentationMode: this.presentationMode,
      signal,
      sourceName: this.source.name,
    })
    this.mounted = mounted
    try {
      await mounted.ready
      signal.throwIfAborted()
      if (this.destroyed || this.mounted !== mounted)
        throw new Error('EPUB reader mount was superseded')
      mounted.activate()
    }
    catch (error) {
      try {
        await mounted.close()
        if (this.mounted === mounted)
          this.mounted = null
      }
      catch (cleanupError) {
        throw combineLifecycleFailures(
          [error, cleanupError],
          'Failed to mount and close EPUB reader',
        )
      }
      throw error
    }
  }

  private registerFinalizers(): void {
    this.finalizer.own({ close: () => this.operations.close(), name: 'reader operations' })
    this.finalizer.own({
      close: async () => {
        const mounted = this.mounted
        await mounted?.close()
        if (this.mounted === mounted)
          this.mounted = null
      },
      name: 'reader mount',
    })
    this.finalizer.own({
      close: () => this.parsed.archive.close(),
      name: 'EPUB archive',
    })
  }

  private requireMount(): EpubReaderMount {
    if (!this.mounted || this.destroyed)
      throw new Error('EPUB reader is not available')
    return this.mounted
  }
}

export async function openEpubAdapter(
  source: EpubSource,
  initialPresentationMode: ReaderPresentationMode,
  initialPosition: ReaderPosition | null | undefined,
  callbacks: ReaderAdapterCallbacks,
  signal?: AbortSignal,
): Promise<ReaderAdapter> {
  const parsed = await parseEpub(source, signal)
  try {
    signal?.throwIfAborted()
    return new EpubAdapter(source, parsed, initialPresentationMode, initialPosition, callbacks)
  }
  catch (error) {
    try {
      await parsed.archive.close()
    }
    catch (cleanupError) {
      throw combineLifecycleFailures(
        [error, cleanupError],
        'Failed to construct and close EPUB reader',
      )
    }
    throw error
  }
}
