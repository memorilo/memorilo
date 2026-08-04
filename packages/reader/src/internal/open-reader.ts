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
    return openPdfAdapter({ ...resolved, format: 'pdf' }, ocrProvider, callbacks)
  }

  if (resolved.format === 'txt') {
    const { openTxtAdapter } = await import('./txt/txt-adapter')
    return openTxtAdapter({ ...resolved, format: 'txt' }, callbacks)
  }

  if (resolved.format === 'cbz' || resolved.format === 'cbr') {
    const { openComicAdapter } = await import('./comic/comic-adapter')
    return openComicAdapter({ ...resolved, format: resolved.format }, callbacks)
  }

  const { openEpubAdapter } = await import('./epub/epub-adapter')
  return openEpubAdapter({ ...resolved, format: 'epub' }, initialPresentationMode, callbacks)
}
