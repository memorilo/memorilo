import { createFileRoute } from '@tanstack/react-router'

import { NoteLibraryPage } from '../features/notes/library/note-library-page'

export const Route = createFileRoute('/pages')({ component: NoteLibraryRoute })

function NoteLibraryRoute() {
  const navigate = Route.useNavigate()
  return (
    <NoteLibraryPage
      onOpenJournal={date => navigate({ search: { date }, to: '/journals' })}
      onOpenNote={(noteId, topicId) => navigate({
        params: { noteId, topicId },
        to: '/note/$noteId/$topicId',
      })}
    />
  )
}
