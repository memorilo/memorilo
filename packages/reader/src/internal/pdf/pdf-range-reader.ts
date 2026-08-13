import type { ResolvedReaderSource } from '../source'
import { createOperationSupervisor } from '@memorilo/effect-lifecycle'
import { toReaderError } from '../reader-adapter'

export interface PdfRangeReader {
  close: () => Promise<void>
  request: (begin: number, end: number) => void
}

interface PdfRangeReaderOptions {
  onData: (begin: number, bytes: Uint8Array) => void
  onError: (error: Error) => void
  source: ResolvedReaderSource
}

/** Owns the asynchronous reads requested through PDF.js's callback-only API. */
export function createPdfRangeReader({
  onData,
  onError,
  source,
}: PdfRangeReaderOptions): PdfRangeReader {
  const reads = createOperationSupervisor('PDF range reader', {
    concurrency: 'unbounded',
    shutdown: 'interrupt',
  })

  const reportError = (error: unknown): void => {
    try {
      onError(toReaderError(error))
    }
    catch {
      // The callback is the terminal error channel for PDF.js range requests.
    }
  }

  const close = (): Promise<void> => {
    return reads.close()
  }

  const request = (begin: number, end: number): void => {
    if (reads.isClosed())
      return
    const reading = reads.run(signal => source.read(begin, end - begin, signal))
    void reading.then(
      (bytes) => {
        if (reads.isClosed())
          return
        try {
          onData(begin, bytes)
        }
        catch (error) {
          reportError(error)
        }
      },
      (error) => {
        if (!reads.isClosed())
          reportError(error)
      },
    )
  }

  return { close, request }
}
