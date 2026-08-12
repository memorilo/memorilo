import type {
  PDFDataRangeTransport,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFWorker,
} from 'pdfjs-dist'
import type { ResolvedReaderSource } from '../source'
import type { PdfJsModule } from './pdf-page-view'
import type { PdfRangeReader } from './pdf-range-reader'
import {
  createResourceScope,
} from '@memorilo/effect-lifecycle'
import { interruptPromise } from '../interrupt-promise'
import { toReaderError } from '../reader-adapter'
import { createPdfRangeReader } from './pdf-range-reader'

type PdfSource = ResolvedReaderSource & { format: 'pdf' }

const pdfRangeChunkSize = 64 * 1024

export interface PdfDocumentSession {
  close: () => Promise<void>
  document: PDFDocumentProxy
  pdfJs: PdfJsModule
}

interface OpenPdfDocumentSessionOptions {
  onError: (error: Error) => void
  signal: AbortSignal
  source: PdfSource
}

export interface PdfDocumentSessionDependencies {
  createNativeWorker?: () => Worker
  createRangeReader?: typeof createPdfRangeReader
  loadPdfJs?: () => Promise<PdfJsModule>
}

function createRangeTransport(
  RangeTransport: typeof PDFDataRangeTransport,
  source: PdfSource,
  initialData: Uint8Array,
  rangeReader: PdfRangeReader,
  reportError: (error: unknown) => void,
): PDFDataRangeTransport {
  return new class extends RangeTransport {
    constructor() {
      super(source.byteLength, initialData)
    }

    override abort(): void {
      void rangeReader.close().then(undefined, reportError)
    }

    override requestDataRange(begin: number, end: number): void {
      rangeReader.request(begin, end)
    }
  }()
}

export async function openPdfDocumentSession(
  { onError, signal, source }: OpenPdfDocumentSessionOptions,
  dependencies: PdfDocumentSessionDependencies = {},
): Promise<PdfDocumentSession> {
  const createNativeWorker = dependencies.createNativeWorker ?? (() => new Worker(
    new URL('./pdf.worker.ts', import.meta.url),
    {
      name: `memorilo-pdf-${crypto.randomUUID()}`,
      type: 'module',
    },
  ))
  const createRangeReader = dependencies.createRangeReader ?? createPdfRangeReader
  const loadPdfJs = dependencies.loadPdfJs ?? (() => import('pdfjs-dist'))
  const scope = createResourceScope('PDF document session')
  const reportError = (error: unknown): void => {
    try {
      onError(toReaderError(error))
    }
    catch {
      // PDF.js invokes this boundary from callback-only transport APIs.
    }
  }

  try {
    const [pdfJs, initialData] = await Promise.all([
      loadPdfJs(),
      source.read(0, Math.min(source.byteLength, pdfRangeChunkSize), signal),
    ])
    signal.throwIfAborted()

    const nativeWorker = (await scope.acquire({
      acquire: createNativeWorker,
      close: worker => worker.terminate(),
      name: 'native PDF worker',
    })).resource
    const pdfWorker = (await scope.acquire<PDFWorker>({
      acquire: () => pdfJs.PDFWorker.create({
        name: `memorilo-pdf-${crypto.randomUUID()}`,
        port: nativeWorker,
      }),
      close: worker => worker.destroy(),
      name: 'PDF.js worker',
    })).resource
    let rangeTransport!: PDFDataRangeTransport
    const rangeReader = (await scope.acquire({
      acquire: () => createRangeReader({
        onData: (begin, bytes) => rangeTransport.onDataRange(begin, bytes),
        onError,
        source,
      }),
      close: reader => reader.close(),
      name: 'PDF range reader',
    })).resource
    rangeTransport = createRangeTransport(
      pdfJs.PDFDataRangeTransport,
      source,
      initialData,
      rangeReader,
      reportError,
    )
    const loadingTask = pdfJs.getDocument({
      enableXfa: false,
      range: rangeTransport,
      rangeChunkSize: pdfRangeChunkSize,
      stopAtErrors: true,
      worker: pdfWorker,
    })
    await scope.acquire<PDFDocumentLoadingTask>({
      acquire: () => loadingTask,
      close: () => loadingTask.destroy(),
      name: 'PDF loading task',
    })
    const cancelLoading = () => {
      void scope.close().then(
        () => undefined,
        reportError,
      )
    }
    signal.addEventListener('abort', cancelLoading, { once: true })
    let document: PDFDocumentProxy
    try {
      document = await interruptPromise(loadingTask.promise, signal)
      signal.throwIfAborted()
    }
    finally {
      signal.removeEventListener('abort', cancelLoading)
    }

    scope.commit()
    return { close: scope.close, document, pdfJs }
  }
  catch (error) {
    return scope.rollback(error)
  }
}
