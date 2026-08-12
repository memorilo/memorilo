import type { NoteSearch } from '../features/notes/editor/note-page'
import { createFileRoute } from '@tanstack/react-router'

import { NotePage } from '../features/notes/editor/note-page'

function validateNoteSearch(search: Record<string, unknown>): NoteSearch {
  if (search.focus === undefined)
    return {}
  if (typeof search.focus !== 'string' || search.focus.trim().length === 0)
    throw new TypeError('Note focus must be a non-empty Block id')
  return { focus: search.focus }
}

export const Route = createFileRoute('/note/$noteId/$topicId')({
  component: NoteRoute,
  validateSearch: validateNoteSearch,
})

function NoteRoute() {
  const { noteId, topicId } = Route.useParams()
  const { focus } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <NotePage
      focus={focus}
      noteId={noteId}
      topicId={topicId}
      onOpenJournal={date => navigate({ search: { date }, to: '/journals' })}
    />
  )
}
