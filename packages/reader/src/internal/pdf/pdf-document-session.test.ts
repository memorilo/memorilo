import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFWorker,
} from 'pdfjs-dist'
import type { ResolvedReaderSource } from '../source'
import type { PdfJsModule } from './pdf-page-view'
import type { PdfRangeReader } from './pdf-range-reader'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'
import { openPdfDocumentSession } from './pdf-document-session'

interface SessionHarnessOptions {
  documentPromise?: Promise<PDFDocumentProxy>
  loadingTaskClose?: () => Promise<void>
}

function createSessionHarness(options: SessionHarnessOptions = {}) {
  const closeOrder: string[] = []
  const document = { numPages: 1 } as PDFDocumentProxy
  const nativeWorker = {
    terminate: vi.fn(() => { closeOrder.push('native worker') }),
  } as unknown as Worker
  const pdfWorker = {
    destroy: vi.fn(async () => { closeOrder.push('PDF.js worker') }),
  } as unknown as PDFWorker
  const rangeReader: PdfRangeReader = {
    close: vi.fn(async () => { closeOrder.push('range reader') }),
    request: vi.fn(),
  }
  const destroyLoadingTask = vi.fn(options.loadingTaskClose ?? (async () => {
    closeOrder.push('loading task')
  }))
  const loadingTask = {
    destroy: destroyLoadingTask,
    promise: options.documentPromise ?? Promise.resolve(document),
  } as unknown as PDFDocumentLoadingTask

  class FakeRangeTransport {
    constructor(_length: number, _initialData: Uint8Array) {}

    abort(): void {}
    onDataRange(): void {}
    requestDataRange(): void {}
  }

  const createPdfWorker = vi.fn(() => pdfWorker)
  const getDocument = vi.fn((_input: unknown) => loadingTask)
  const pdfJs = {
    PDFDataRangeTransport: FakeRangeTransport,
    PDFWorker: { create: createPdfWorker },
    getDocument,
  } as unknown as PdfJsModule
  const source = {
    byteLength: 4,
    format: 'pdf',
    name: 'document.pdf',
    read: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
  } satisfies ResolvedReaderSource
  const createRangeReader = vi.fn(() => rangeReader)

  return {
    closeOrder,
    dependencies: {
      createNativeWorker: () => nativeWorker,
      createRangeReader,
      loadPdfJs: async () => pdfJs,
    },
    destroyLoadingTask,
    document,
    getDocument,
    nativeWorker,
    pdfWorker,
    rangeReader,
    rangeTransport: () => {
      const input = getDocument.mock.calls.at(-1)?.[0] as { range?: { abort: () => void } } | undefined
      if (!input?.range)
        throw new Error('PDF range transport was not created')
      return input.range
    },
    source,
  }
}

describe('pdf document session', () => {
  it('destroys the loading task and rolls back every acquired resource when loading is aborted', async () => {
    const document = deferred<PDFDocumentProxy>()
    const harness = createSessionHarness({ documentPromise: document.promise })
    const controller = new AbortController()
    const abortReason = new Error('reader closed during PDF loading')
    const opening = openPdfDocumentSession({
      onError: vi.fn(),
      signal: controller.signal,
      source: harness.source,
    }, harness.dependencies)
    await vi.waitFor(() => expect(harness.getDocument).toHaveBeenCalledOnce())

    controller.abort(abortReason)

    await expect(opening).rejects.toBe(abortReason)
    expect(harness.closeOrder).toEqual([
      'loading task',
      'range reader',
      'PDF.js worker',
      'native worker',
    ])
    expect(harness.destroyLoadingTask).toHaveBeenCalledOnce()
    document.reject(new Error('late PDF.js loading rejection'))
    await new Promise<void>(resolve => queueMicrotask(() => resolve()))
  })

  it('shares concurrent close and releases owned resources in reverse acquisition order', async () => {
    const loadingTaskClose = deferred<void>()
    const harness = createSessionHarness({
      loadingTaskClose: async () => {
        harness.closeOrder.push('loading task')
        await loadingTaskClose.promise
      },
    })
    const session = await openPdfDocumentSession({
      onError: vi.fn(),
      signal: new AbortController().signal,
      source: harness.source,
    }, harness.dependencies)

    const firstClose = session.close()
    const concurrentClose = session.close()

    expect(concurrentClose).toBe(firstClose)
    await vi.waitFor(() => expect(harness.destroyLoadingTask).toHaveBeenCalledOnce())
    expect(harness.closeOrder).toEqual(['loading task'])
    loadingTaskClose.resolve()
    await firstClose
    expect(harness.closeOrder).toEqual([
      'loading task',
      'range reader',
      'PDF.js worker',
      'native worker',
    ])
    expect(session.close()).toBe(firstClose)
  })

  it('rolls back earlier resources when document startup fails', async () => {
    const harness = createSessionHarness()
    const startupFailure = new Error('PDF.js rejected the document')
    harness.getDocument.mockImplementation(() => {
      throw startupFailure
    })

    await expect(openPdfDocumentSession({
      onError: vi.fn(),
      signal: new AbortController().signal,
      source: harness.source,
    }, harness.dependencies)).rejects.toBe(startupFailure)
    expect(harness.closeOrder).toEqual([
      'range reader',
      'PDF.js worker',
      'native worker',
    ])
  })

  it('aggregates cleanup failures and retries only resources that failed to close', async () => {
    const cleanupFailure = new Error('loading task still busy')
    const harness = createSessionHarness({
      loadingTaskClose: vi.fn()
        .mockImplementationOnce(async () => {
          harness.closeOrder.push('loading task failed')
          throw cleanupFailure
        })
        .mockImplementationOnce(async () => {
          harness.closeOrder.push('loading task retried')
        }),
    })
    const session = await openPdfDocumentSession({
      onError: vi.fn(),
      signal: new AbortController().signal,
      source: harness.source,
    }, harness.dependencies)

    const error = await session.close().catch(cause => cause)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({
        cause: cleanupFailure,
        message: 'Failed to close PDF loading task',
      }),
    ])
    expect(harness.closeOrder).toEqual([
      'loading task failed',
      'range reader',
      'PDF.js worker',
      'native worker',
    ])

    await expect(session.close()).resolves.toBeUndefined()
    expect(harness.closeOrder).toEqual([
      'loading task failed',
      'range reader',
      'PDF.js worker',
      'native worker',
      'loading task retried',
    ])
  })

  it('reports range transport abort failures without trusting the observer', async () => {
    const closeFailure = new Error('range reader still busy')
    const observerFailure = new Error('error observer failed')
    const harness = createSessionHarness()
    vi.mocked(harness.rangeReader.close)
      .mockRejectedValueOnce(closeFailure)
      .mockResolvedValueOnce(undefined)
    const onError = vi.fn(() => {
      throw observerFailure
    })
    const session = await openPdfDocumentSession({
      onError,
      signal: new AbortController().signal,
      source: harness.source,
    }, harness.dependencies)

    expect(() => harness.rangeTransport().abort()).not.toThrow()
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(closeFailure))
    await expect(session.close()).resolves.toBeUndefined()
    expect(harness.rangeReader.close).toHaveBeenCalledTimes(2)
  })
})
