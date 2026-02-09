import { createLazyFileRoute } from '@tanstack/react-router'
import { NotesEmpty } from '~/components/notes-empty'

export const Route = createLazyFileRoute('/all-notes')({
  component: RouteComponent,
})

function RouteComponent() {
  return <NotesEmpty />
}
