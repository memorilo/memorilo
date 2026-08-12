import type { ResolvedReaderSource } from '../source'
import { describe, expect, it, vi } from 'vitest'
import { createPdfRangeReader } from './pdf-range-reader'

function source(read: ResolvedReaderSource['read']): ResolvedReaderSource {
  return { byteLength: 16, format: 'pdf', name: 'test.pdf', read }
}

describe('pdf range reader', () => {
  it('interrupts accepted reads, suppresses their callbacks, and rejects later admission', async () => {
    let acceptedSignal: AbortSignal | undefined
    const read = vi.fn(async (_offset: number, _length: number, signal?: AbortSignal) => {
      acceptedSignal = signal
      await new Promise<never>((_, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
      return new Uint8Array()
    })
    const onData = vi.fn()
    const owner = createPdfRangeReader({ onData, onError: vi.fn(), source: source(read) })

    owner.request(2, 4)
    await vi.waitFor(() => expect(acceptedSignal).toBeDefined())
    const closing = owner.close()
    owner.request(4, 6)

    await expect(closing).resolves.toBeUndefined()
    expect(acceptedSignal?.aborted).toBe(true)
    expect(read).toHaveBeenCalledOnce()
    expect(onData).not.toHaveBeenCalled()
    expect(owner.close()).toBe(closing)
  })

  it('reports read and data callback failures through the error channel', async () => {
    const readError = new Error('range failed')
    const callbackError = new Error('PDF.js rejected range data')
    const onError = vi.fn()
    const failedRead = createPdfRangeReader({
      onData: vi.fn(),
      onError,
      source: source(async () => Promise.reject(readError)),
    })
    failedRead.request(0, 2)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(readError))

    const failedCallback = createPdfRangeReader({
      onData: () => {
        throw callbackError
      },
      onError,
      source: source(async () => new Uint8Array([1, 2])),
    })
    failedCallback.request(0, 2)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(callbackError))
  })
})
