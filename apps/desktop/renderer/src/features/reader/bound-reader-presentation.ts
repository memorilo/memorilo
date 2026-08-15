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
