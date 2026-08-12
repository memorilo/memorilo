import type { ReaderOcrProvider, ReaderPosition, ReaderPresentationMode, ReaderSource } from '../types'
import type { ReaderAdapter, ReaderAdapterCallbacks } from './reader-adapter'
import { resolveSource } from './source'

export async function openReaderAdapter(
  source: ReaderSource,
  initialPresentationMode: ReaderPresentationMode,
  initialPosition: ReaderPosition | null | undefined,
  ocrProvider: ReaderOcrProvider | undefined,
  callbacks: ReaderAdapterCallbacks,
  signal?: AbortSignal,
): Promise<ReaderAdapter> {
  const resolved = await resolveSource(source, signal)
  signal?.throwIfAborted()
  if (resolved.format === 'pdf') {
    const { openPdfAdapter } = await import('./pdf/pdf-adapter')
    signal?.throwIfAborted()
    return openPdfAdapter({ ...resolved, format: 'pdf' }, initialPosition, ocrProvider, callbacks)
  }

  if (resolved.format === 'txt') {
    const { openTxtAdapter } = await import('./txt/txt-adapter')
    signal?.throwIfAborted()
    return openTxtAdapter({ ...resolved, format: 'txt' }, initialPosition, callbacks, signal)
  }

  if (resolved.format === 'cbz' || resolved.format === 'cbr') {
    const { openComicAdapter } = await import('./comic/comic-adapter')
    signal?.throwIfAborted()
    return openComicAdapter({ ...resolved, format: resolved.format }, initialPosition, callbacks, signal)
  }

  const { openEpubAdapter } = await import('./epub/epub-adapter')
  signal?.throwIfAborted()
  return openEpubAdapter(
    { ...resolved, format: 'epub' },
    initialPresentationMode,
    initialPosition,
    callbacks,
    signal,
  )
}
