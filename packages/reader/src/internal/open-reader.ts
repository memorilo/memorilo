import type { ReaderOcrProvider, ReaderPresentationMode, ReaderSource } from '../types'
import type { ReaderAdapter, ReaderAdapterCallbacks } from './reader-adapter'
import { resolveSource } from './source'

export async function openReaderAdapter(
  source: ReaderSource,
  initialPresentationMode: ReaderPresentationMode,
  ocrProvider: ReaderOcrProvider | undefined,
  callbacks: ReaderAdapterCallbacks,
): Promise<ReaderAdapter> {
  const resolved = await resolveSource(source)
  if (resolved.format === 'pdf') {
    const { openPdfAdapter } = await import('./pdf/pdf-adapter')
    return openPdfAdapter(resolved, ocrProvider, callbacks)
  }

  const { openEpubAdapter } = await import('./epub/epub-adapter')
  return openEpubAdapter(resolved, initialPresentationMode, callbacks)
}
