import type {
  ReaderAnnotation,
  ReaderOcrProvider,
  ReaderOcrStatus,
  ReaderPageMode,
  ReaderPosition,
  ReaderPresentationMode,
  ReaderSource,
} from '../types'
import type { openReaderAdapter } from './open-reader'
import type {
  ReaderAdapter,
  ReaderAdapterKeyboardEvent,
  ReaderAdapterSelection,
  ReaderAdapterState,
  ReaderScrollDirection,
} from './reader-adapter'
import {
  combineLifecycleFailures,
  createOperationSupervisor,
  createResourceScope,
} from '@memorilo/effect-lifecycle'
import { openReaderAdapter as openDefaultReaderAdapter } from './open-reader'
import { toReaderError } from './reader-adapter'

export type ReaderOperation
  = (adapter: ReaderAdapter, signal: AbortSignal) => Promise<void> | void

export type ReaderSessionEvent
  = | { type: 'begin' }
    | { annotationId: string, type: 'annotation-activate' }
    | { error: Error, type: 'error' }
    | { status: ReaderOcrStatus, type: 'ocr-status' }
    | { enabled: boolean, type: 'region-selection' }
    | { type: 'ready' }
    | { type: 'reset' }
    | { selection: ReaderAdapterSelection | null, type: 'selection' }
    | { state: ReaderAdapterState, type: 'state' }

interface ReaderSessionRuntimeOptions {
  arrowKeyPageTurning: () => boolean
  container: HTMLElement
  initialAnnotations: readonly ReaderAnnotation[]
  initialPosition?: ReaderPosition | null
  initialPageMode?: ReaderPageMode
  initialPresentationMode: ReaderPresentationMode
  ocrProvider?: ReaderOcrProvider
  onEvent: (event: ReaderSessionEvent) => void
  regionAnnotationLabel: () => string
  source: ReaderSource
}

interface ReaderSessionRuntimeDependencies {
  openAdapter?: typeof openReaderAdapter
}

export interface ReaderSessionRuntime {
  clearSelection: () => void
  close: () => Promise<void>
  handleKeyboardEvent: (event: ReaderAdapterKeyboardEvent) => boolean
  reportError: (error: unknown) => void
  run: (operation: ReaderOperation) => boolean
  setAnnotations: (annotations: readonly ReaderAnnotation[]) => void
  setPageMode: (pageMode: ReaderPageMode) => void
  setRegionSelectionEnabled: (enabled: boolean) => void
  start: () => Promise<void>
}

interface OwnedAdapter {
  adapter: ReaderAdapter
  pageMode: ReaderPageMode
  released: boolean
}

function readerScrollDirection(key: string): ReaderScrollDirection | undefined {
  if (key === 'ArrowDown')
    return 'down'
  if (key === 'ArrowLeft')
    return 'left'
  if (key === 'ArrowRight')
    return 'right'
  if (key === 'ArrowUp')
    return 'up'
  return undefined
}

export function createReaderSessionRuntime(
  options: ReaderSessionRuntimeOptions,
  dependencies: ReaderSessionRuntimeDependencies = {},
): ReaderSessionRuntime {
  const openAdapter = dependencies.openAdapter ?? openDefaultReaderAdapter
  let active = true
  let adapter: ReaderAdapter | null = null
  let ownedAdapter: OwnedAdapter | null = null
  let annotations = options.initialAnnotations
  let pageMode = options.initialPageMode ?? 'continuous'
  let lastPosition = options.initialPosition ?? null
  let directionalKeyAction: 'none' | 'page-turned' | 'scrolled' = 'none'
  let startPromise: Promise<void> | undefined
  const commands = createOperationSupervisor('Reader session commands', { shutdown: 'interrupt' })
  const adapterResources = createResourceScope('Reader session adapters')
  const lifecycle = createResourceScope('Reader session')
  lifecycle.own({ close: commands.close, name: 'reader commands' })
  lifecycle.own({ close: adapterResources.close, name: 'reader adapters' })
  lifecycle.commit()

  const emit = (event: ReaderSessionEvent): void => {
    if (!active)
      return
    try {
      options.onEvent(event)
    }
    catch {
      // The event sink observes session state; it must not become an
      // unhandled rejection from an adapter callback or command failure.
    }
  }

  const emitReset = (): void => {
    try {
      options.onEvent({ type: 'reset' })
    }
    catch {
      // Reset is observational and must not bypass resource cleanup.
    }
  }

  const reportError = (value: unknown): void => {
    emit({ error: toReaderError(value), type: 'error' })
  }

  const run = (operation: ReaderOperation): boolean => {
    const current = adapter
    if (!active || !current)
      return false

    const result = commands.run((signal) => {
      return Promise.resolve().then(() => {
        signal.throwIfAborted()
        return operation(current, signal)
      })
    })
    void result.then(
      () => undefined,
      reportError,
    )
    return true
  }

  const handleKeyboardEvent = (event: ReaderAdapterKeyboardEvent): boolean => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return false
    if (!active || !adapter)
      return false

    if (pageMode === 'continuous' && (event.key === 'PageUp' || event.key === 'PageDown')) {
      try {
        adapter.moveViewport(event.key === 'PageUp' ? 'page-up' : 'page-down')
      }
      catch (error) {
        reportError(error)
      }
      return true
    }
    if (event.key === 'PageUp') {
      run(current => current.goBackward('end'))
      return true
    }
    if (event.key === 'PageDown') {
      run(current => current.goForward('start'))
      return true
    }

    const direction = readerScrollDirection(event.key)
    if (!direction)
      return false

    if (pageMode === 'continuous' && (direction === 'left' || direction === 'right')) {
      if (direction === 'right')
        run(current => current.goForward('start'))
      else
        run(current => current.goBackward('end'))
      return true
    }

    if (pageMode === 'continuous') {
      try {
        adapter.moveViewport(direction)
      }
      catch (error) {
        reportError(error)
      }
      return true
    }

    if (!event.repeat)
      directionalKeyAction = 'none'
    else if (directionalKeyAction === 'page-turned')
      return true

    let result: ReturnType<ReaderAdapter['moveViewport']>
    try {
      result = adapter.moveViewport(direction)
    }
    catch (error) {
      reportError(error)
      return true
    }
    if (result === 'scrolled') {
      directionalKeyAction = 'scrolled'
      return true
    }

    if (!options.arrowKeyPageTurning())
      return false
    if (event.repeat && directionalKeyAction === 'scrolled')
      return true

    directionalKeyAction = 'page-turned'
    if (direction === 'down' || direction === 'right')
      run(current => current.goForward('start'))
    else
      run(current => current.goBackward('end'))
    return true
  }

  const destroyOwned = async (owned: OwnedAdapter): Promise<void> => {
    if (owned.released)
      return
    await owned.adapter.destroy()
    owned.released = true
    if (adapter === owned.adapter)
      adapter = null
    if (ownedAdapter === owned)
      ownedAdapter = null
  }

  const openOwned = async (
    signal: AbortSignal,
    initialPosition: ReaderPosition | null | undefined = lastPosition,
  ): Promise<void> => {
    emit({ type: 'begin' })
    try {
      const openingPageMode = pageMode
      const owned = (await adapterResources.acquire({
        acquire: async (): Promise<OwnedAdapter> => {
          const openedAdapter = await openAdapter(
            options.source,
            options.initialPresentationMode,
            openingPageMode,
            initialPosition,
            options.ocrProvider,
            {
              onAnnotationActivate: ({ annotationId }) => emit({ annotationId, type: 'annotation-activate' }),
              onError: reportError,
              onKeyDown: handleKeyboardEvent,
              onOcrStatusChange: status => emit({ status, type: 'ocr-status' }),
              onRegionSelectionModeChange: enabled => emit({ enabled, type: 'region-selection' }),
              onSelectionChange: selection => emit({ selection, type: 'selection' }),
              onStateChange: (state) => {
                lastPosition = state.position
                emit({ state, type: 'state' })
              },
              regionAnnotationLabel: options.regionAnnotationLabel,
            },
            signal,
          )
          return { adapter: openedAdapter, pageMode: openingPageMode, released: false }
        },
        close: destroyOwned,
        name: 'reader adapter',
      })).resource
      adapter = owned.adapter
      ownedAdapter = owned
      if (!active)
        return

      try {
        owned.adapter.setAnnotations(annotations)
        await owned.adapter.mount(options.container, signal)
      }
      catch (mountError) {
        if (!active)
          return
        try {
          await destroyOwned(owned)
        }
        catch (cleanupError) {
          throw combineLifecycleFailures(
            [mountError, cleanupError],
            'Reader failed to mount and clean up',
          )
        }
        throw mountError
      }

      if (active)
        emit({ type: 'ready' })
    }
    catch (error) {
      adapter = null
      if (active)
        reportError(error)
    }
  }

  const start = (): Promise<void> => {
    if (!startPromise) {
      // Startup includes adapter mount and must belong to the same admitted
      // command lifetime as user operations. Otherwise resource close could
      // destroy the adapter while mount continuation is still running and
      // resolve before that continuation has drained.
      startPromise = commands.run(signal => openOwned(signal))
    }
    return startPromise
  }

  const close = (): Promise<void> => {
    if (active) {
      active = false
      adapter = null
      // Reset is observational. Keep a throwing renderer callback from
      // bypassing adapter/resource cleanup during shutdown.
      emitReset()
    }
    return lifecycle.close()
  }

  return {
    clearSelection: () => {
      if (!run(current => current.clearSelection()))
        emit({ selection: null, type: 'selection' })
    },
    close,
    handleKeyboardEvent,
    reportError,
    run,
    setAnnotations: (nextAnnotations) => {
      annotations = nextAnnotations
      if (active)
        adapter?.setAnnotations(nextAnnotations)
    },
    setPageMode: (nextPageMode) => {
      if (!active || nextPageMode === pageMode)
        return
      pageMode = nextPageMode
      const result = commands.run(async (signal) => {
        const current = ownedAdapter
        if (!current || current.pageMode === pageMode)
          return
        const position = lastPosition
        await destroyOwned(current)
        if (!active)
          return
        await openOwned(signal, position)
      })
      void result.then(() => undefined, reportError)
    },
    setRegionSelectionEnabled: (enabled) => {
      run((current) => {
        if (!current.setRegionSelectionEnabled)
          throw new Error('The reader declared area selection without providing its command')
        current.setRegionSelectionEnabled(enabled)
      })
    },
    start,
  }
}
