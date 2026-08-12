import type { ReaderAnnotation, ReaderSource } from '../types'
import type { openReaderAdapter } from './open-reader'
import type { ReaderAdapter, ReaderAdapterCallbacks } from './reader-adapter'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'
import { initialReaderSessionState, readerSessionReducer } from './reader-session-engine'
import { createReaderSessionRuntime } from './reader-session-runtime'

function fakeAdapter(overrides: Partial<ReaderAdapter> = {}): ReaderAdapter {
  return {
    clearSelection: vi.fn(),
    destroy: vi.fn().mockResolvedValue(undefined),
    goBackward: vi.fn().mockResolvedValue(undefined),
    goForward: vi.fn().mockResolvedValue(undefined),
    goToAnnotation: vi.fn().mockResolvedValue(undefined),
    mount: vi.fn().mockResolvedValue(undefined),
    moveViewport: vi.fn((): 'at-boundary' => 'at-boundary'),
    setAnnotations: vi.fn(),
    ...overrides,
  }
}

const source: ReaderSource = { data: new Uint8Array(), format: 'pdf' }

describe('reader session runtime', () => {
  it('keeps OCR progress separate from committed text projection and clears it on page change', () => {
    const recognizing = readerSessionReducer(initialReaderSessionState, {
      status: { pageNumber: 1, state: 'recognizing' },
      type: 'ocr-status',
    })

    expect(recognizing.ocrStatus).toEqual({ pageNumber: 1, state: 'recognizing' })
    expect(recognizing.adapter.textLayer).toBeUndefined()

    const nextPage = readerSessionReducer(recognizing, {
      state: {
        ...recognizing.adapter,
        location: { format: 'pdf', label: '2 of 2', progression: 1 },
        position: { format: 'pdf', pageNumber: 2 },
      },
      type: 'state',
    })

    expect(nextPage.ocrStatus).toBeNull()
  })

  it('publishes the latest annotations when acquisition finishes', async () => {
    const acquisition = deferred<ReaderAdapter>()
    const adapter = fakeAdapter()
    const initialAnnotations: readonly ReaderAnnotation[] = []
    const latestAnnotations: readonly ReaderAnnotation[] = []
    const openAdapter = vi.fn((..._args: Parameters<typeof openReaderAdapter>) => acquisition.promise)
    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => true,
      container: {} as HTMLElement,
      initialAnnotations,
      initialPresentationMode: 'publisher',
      onEvent: vi.fn(),
      regionAnnotationLabel: () => 'Open annotation',
      source,
    }, { openAdapter })

    const opening = runtime.start()
    runtime.setAnnotations(latestAnnotations)
    acquisition.resolve(adapter)
    await opening

    expect(adapter.setAnnotations).toHaveBeenCalledOnce()
    expect(adapter.setAnnotations).toHaveBeenCalledWith(latestAnnotations)
    await runtime.close()
  })

  it('suppresses adapter callbacks after close starts', async () => {
    let callbacks!: ReaderAdapterCallbacks
    const eventTypes: string[] = []
    const adapter = fakeAdapter()
    const openAdapter = vi.fn(async (...args: Parameters<typeof openReaderAdapter>) => {
      callbacks = args[4]
      return adapter
    })
    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => true,
      container: {} as HTMLElement,
      initialAnnotations: [],
      initialPresentationMode: 'publisher',
      onEvent: event => eventTypes.push(event.type),
      regionAnnotationLabel: () => 'Open annotation',
      source,
    }, { openAdapter })
    await runtime.start()
    await runtime.close()
    const eventCountAfterClose = eventTypes.length

    callbacks.onError(new Error('stale adapter error'))
    callbacks.onSelectionChange(null)
    callbacks.onRegionSelectionModeChange(true)

    expect(eventTypes).toEqual(['begin', 'ready', 'reset'])
    expect(eventTypes).toHaveLength(eventCountAfterClose)
  })

  it('continues cleanup when the reset event observer throws', async () => {
    const adapter = fakeAdapter()
    const onEvent = vi.fn((event: { type: string }) => {
      if (event.type === 'reset')
        throw new Error('renderer already unmounted')
    })
    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => true,
      container: {} as HTMLElement,
      initialAnnotations: [],
      initialPresentationMode: 'publisher',
      onEvent,
      regionAnnotationLabel: () => 'Open annotation',
      source,
    }, {
      openAdapter: async () => adapter,
    })

    await runtime.start()
    await expect(runtime.close()).resolves.toBeUndefined()
    expect(adapter.destroy).toHaveBeenCalledOnce()
    expect(onEvent).toHaveBeenCalledWith({ type: 'reset' })
  })

  it('reports synchronous and asynchronous command failures through one channel', async () => {
    const errors: Error[] = []
    const viewportFailure = new Error('viewport command failure')
    const adapter = fakeAdapter({
      moveViewport: vi.fn(() => {
        throw viewportFailure
      }),
    })
    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => true,
      container: {} as HTMLElement,
      initialAnnotations: [],
      initialPresentationMode: 'publisher',
      onEvent: (event) => {
        if (event.type === 'error')
          errors.push(event.error)
      },
      regionAnnotationLabel: () => 'Open annotation',
      source,
    }, { openAdapter: async () => adapter })
    await runtime.start()
    const synchronous = new Error('synchronous command failure')
    const asynchronous = new Error('asynchronous command failure')

    expect(runtime.run(() => {
      throw synchronous
    })).toBe(true)
    expect(runtime.run(() => Promise.reject(asynchronous))).toBe(true)
    expect(runtime.handleKeyboardEvent({
      altKey: false,
      ctrlKey: false,
      key: 'ArrowDown',
      metaKey: false,
      repeat: false,
      shiftKey: false,
    })).toBe(true)
    await vi.waitFor(() => expect(errors).toHaveLength(3))
    expect(errors).toEqual(expect.arrayContaining([synchronous, viewportFailure, asynchronous]))
    await runtime.close()
  })

  it('isolates event observer failures from command ownership', async () => {
    const observerFailure = new Error('reader event observer failed')
    const onEvent = vi.fn((event) => {
      if (event.type === 'error')
        throw observerFailure
    })
    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => true,
      container: {} as HTMLElement,
      initialAnnotations: [],
      initialPresentationMode: 'publisher',
      onEvent,
      regionAnnotationLabel: () => 'Open annotation',
      source,
    }, { openAdapter: async () => fakeAdapter() })
    await runtime.start()

    expect(() => runtime.reportError(new Error('direct failure'))).not.toThrow()
    expect(runtime.run(async () => {
      throw new Error('command failure')
    })).toBe(true)
    const laterCommand = vi.fn()
    expect(runtime.run(async () => {
      laterCommand()
    })).toBe(true)

    await vi.waitFor(() => expect(laterCommand).toHaveBeenCalledOnce())
    expect(onEvent.mock.calls.filter(([event]) => event.type === 'error')).toHaveLength(2)
    await runtime.close()
  })

  it('drains active commands before adapter destruction and invalidates queued commands', async () => {
    const activeCommand = deferred<void>()
    const order: string[] = []
    const adapter = fakeAdapter({
      destroy: vi.fn(async () => {
        order.push('destroy')
      }),
    })
    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => true,
      container: {} as HTMLElement,
      initialAnnotations: [],
      initialPresentationMode: 'publisher',
      onEvent: vi.fn(),
      regionAnnotationLabel: () => 'Open annotation',
      source,
    }, { openAdapter: async () => adapter })
    await runtime.start()

    expect(runtime.run(async () => {
      order.push('first:start')
      await activeCommand.promise
      order.push('first:end')
    })).toBe(true)
    expect(runtime.run(async () => {
      order.push('second')
    })).toBe(true)
    await vi.waitFor(() => expect(order).toEqual(['first:start']))

    const closing = runtime.close()
    expect(runtime.run(async () => {
      order.push('rejected')
    })).toBe(false)
    await vi.waitFor(() => expect(order).toEqual(['first:start']), { timeout: 100 })
    activeCommand.resolve()

    await expect(closing).resolves.toBeUndefined()
    expect(order).toEqual(['first:start', 'first:end', 'destroy'])
  })

  it('releases command admission after a failed operation', async () => {
    const errors: Error[] = []
    const adapter = fakeAdapter()
    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => true,
      container: {} as HTMLElement,
      initialAnnotations: [],
      initialPresentationMode: 'publisher',
      onEvent: (event) => {
        if (event.type === 'error')
          errors.push(event.error)
      },
      regionAnnotationLabel: () => 'Open annotation',
      source,
    }, { openAdapter: async () => adapter })
    await runtime.start()
    const failure = new Error('command failed')
    const retried = vi.fn()

    expect(runtime.run(async () => {
      throw failure
    })).toBe(true)
    expect(runtime.run(async () => {
      retried()
    })).toBe(true)

    await vi.waitFor(() => expect(retried).toHaveBeenCalledOnce())
    expect(errors).toEqual([failure])
    await runtime.close()
  })

  it('destroys ownership acquired after close without mounting it', async () => {
    const acquisition = deferred<ReaderAdapter>()
    const adapter = fakeAdapter()
    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => true,
      container: {} as HTMLElement,
      initialAnnotations: [],
      initialPresentationMode: 'publisher',
      onEvent: vi.fn(),
      regionAnnotationLabel: () => 'Open annotation',
      source,
    }, { openAdapter: async () => acquisition.promise })

    const opening = runtime.start()
    const closing = runtime.close()
    acquisition.resolve(adapter)

    await expect(opening).resolves.toBeUndefined()
    await expect(closing).resolves.toBeUndefined()
    expect(adapter.mount).not.toHaveBeenCalled()
    expect(adapter.destroy).toHaveBeenCalledOnce()
  })

  it('waits for an admitted mount continuation before close resolves', async () => {
    const mountStarted = deferred<void>()
    const releaseMount = deferred<void>()
    let mountSignal!: AbortSignal
    const adapter = fakeAdapter({
      mount: vi.fn(async (_container, signal) => {
        mountSignal = signal!
        mountStarted.resolve()
        await releaseMount.promise
      }),
    })
    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => true,
      container: {} as HTMLElement,
      initialAnnotations: [],
      initialPresentationMode: 'publisher',
      onEvent: vi.fn(),
      regionAnnotationLabel: () => 'Open annotation',
      source,
    }, { openAdapter: async () => adapter })

    const opening = runtime.start()
    await mountStarted.promise
    const closing = runtime.close()
    let closed = false
    void closing.then(() => {
      closed = true
    })

    await Promise.resolve()
    expect(closed).toBe(false)
    expect(mountSignal.aborted).toBe(true)
    expect(adapter.destroy).not.toHaveBeenCalled()
    releaseMount.resolve()
    await opening
    await closing
    expect(adapter.destroy).toHaveBeenCalledOnce()
  })

  it('reports mount and cleanup failures together and retains ownership for close retry', async () => {
    const mountError = new Error('mount failed')
    const cleanupError = new Error('cleanup failed')
    const destroy = vi.fn()
      .mockRejectedValueOnce(cleanupError)
      .mockResolvedValueOnce(undefined)
    const adapter = fakeAdapter({
      destroy,
      mount: vi.fn().mockRejectedValue(mountError),
    })
    const errors: Error[] = []
    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => true,
      container: {} as HTMLElement,
      initialAnnotations: [],
      initialPresentationMode: 'publisher',
      onEvent: (event) => {
        if (event.type === 'error')
          errors.push(event.error)
      },
      regionAnnotationLabel: () => 'Open annotation',
      source,
    }, { openAdapter: async () => adapter })

    await runtime.start()

    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(AggregateError)
    expect((errors[0] as AggregateError).errors).toEqual([mountError, cleanupError])
    await expect(runtime.close()).resolves.toBeUndefined()
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('shares concurrent close and retries only retained adapter ownership', async () => {
    const destroying = deferred<void>()
    const failure = new Error('worker busy')
    const destroy = vi.fn()
      .mockImplementationOnce(() => destroying.promise)
      .mockResolvedValueOnce(undefined)
    const adapter = fakeAdapter({ destroy })
    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => true,
      container: {} as HTMLElement,
      initialAnnotations: [],
      initialPresentationMode: 'publisher',
      onEvent: vi.fn(),
      regionAnnotationLabel: () => 'Open annotation',
      source,
    }, { openAdapter: async () => adapter })
    await runtime.start()

    const first = runtime.close()
    expect(runtime.close()).toBe(first)
    destroying.reject(failure)
    const closeError = await first.catch(error => error)
    expect(closeError).toBeInstanceOf(AggregateError)
    expect((closeError as AggregateError).errors).toEqual([
      expect.objectContaining({
        cause: failure,
        message: 'Failed to close reader adapter',
      }),
    ])

    await expect(runtime.close()).resolves.toBeUndefined()
    expect(destroy).toHaveBeenCalledTimes(2)
  })
})
