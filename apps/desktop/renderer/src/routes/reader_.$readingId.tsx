import type { ShelfReaderSearch } from '../features/reader/reader-page'
import { createFileRoute } from '@tanstack/react-router'

import { ReaderPage } from '../features/reader/reader-page'

function validateShelfReaderSearch(search: Record<string, unknown>): ShelfReaderSearch {
  if (search.noteId === undefined && search.topicId === undefined && search.annotationId === undefined)
    return {}
  if (typeof search.noteId !== 'string' || search.noteId.trim().length === 0)
    throw new TypeError('Reader Note id must be a non-empty string')
  if (typeof search.topicId !== 'string' || search.topicId.trim().length === 0)
    throw new TypeError('Reader BookTopic id must be a non-empty string')
  if (search.annotationId !== undefined
    && (typeof search.annotationId !== 'string' || search.annotationId.trim().length === 0)) {
    throw new TypeError('Reader annotation id must be a non-empty string')
  }
  return {
    ...(search.annotationId === undefined ? {} : { annotationId: search.annotationId }),
    noteId: search.noteId,
    topicId: search.topicId,
  }
}

export const Route = createFileRoute('/reader_/$readingId')({
  component: ShelfReaderRoute,
  validateSearch: validateShelfReaderSearch,
})

function ShelfReaderRoute() {
  const { readingId } = Route.useParams()
  const search = Route.useSearch()
  return <ReaderPage readingId={readingId} search={search} />
}
