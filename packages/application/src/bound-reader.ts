import type { EditorBookTopicDocument, EditorNote } from '@memorilo/editor/note'
import type { ReaderAnnotation, ReaderPosition } from '@memorilo/editor/reader'
import type { BookReadingState } from '@memorilo/reading-model'
import { reconciledReaderAnnotations } from '@memorilo/editor/reader'

export interface BoundReaderProjection {
  readonly annotations: readonly ReaderAnnotation[]
  readonly entries: ReturnType<EditorNote['getEntries']>
  readonly position: ReaderPosition | null
  readonly readingState: BookReadingState
}

export interface BoundReaderSession {
  readonly bookTopic: EditorBookTopicDocument
  readonly initialAnnotations: readonly ReaderAnnotation[]
  readonly initialPosition: ReaderPosition | null
  readonly initialReadingState: BookReadingState
  readonly project: () => BoundReaderProjection
}

export function createBoundReaderSession(
  note: EditorNote,
  bookTopicId: string,
  fallbackInitialPosition: ReaderPosition | null = null,
): BoundReaderSession {
  const bookTopic = note.getBookTopic(bookTopicId)
  const initialReadingState = bookTopic.getReadingState()
  const initialAnnotations = reconciledReaderAnnotations(
    note,
    bookTopicId,
    initialReadingState.annotations,
  )

  const project = (): BoundReaderProjection => {
    const readingState = bookTopic.getReadingState()
    const annotations = reconciledReaderAnnotations(note, bookTopicId, readingState.annotations)
    return {
      annotations,
      entries: note.getEntries(),
      position: readingState.position,
      readingState,
    }
  }

  return {
    bookTopic,
    initialAnnotations,
    initialPosition: initialReadingState.position ?? fallbackInitialPosition,
    initialReadingState,
    project,
  }
}

interface BoundReaderPresentationInput {
  bookTitle: string
  noteTitle: string
  topicTitle: string
}

interface BoundReaderPresentation {
  annotationCopyBookTitle: string
  title: string
}

function normalizedTitle(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
}

export function boundReaderPresentation({
  bookTitle,
  noteTitle,
  topicTitle,
}: BoundReaderPresentationInput): BoundReaderPresentation {
  const trimmedBookTitle = bookTitle.trim()
  const trimmedNoteTitle = noteTitle.trim()
  const trimmedTopicTitle = topicTitle.trim()
  if (!trimmedBookTitle)
    throw new TypeError('Bound Reader publication title must be non-empty')
  return {
    annotationCopyBookTitle: trimmedBookTitle,
    title: normalizedTitle(trimmedNoteTitle) === normalizedTitle(trimmedTopicTitle)
      ? trimmedNoteTitle
      : `${trimmedNoteTitle} · ${trimmedTopicTitle}`,
  }
}
