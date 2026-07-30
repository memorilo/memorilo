import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

import { usePageTitlebar } from '../components/page-titlebar'
import { editorRouteStyles } from './-note.stylex'

const NoteEditor = lazy(async () => {
  const module = await import('./-note-editor')
  return { default: module.NoteEditor }
})

const noteTitlebar = { title: 'Note' } as const

interface NoteSearch {
  focus?: string
}

function validateNoteSearch(search: Record<string, unknown>): NoteSearch {
  if (search.focus === undefined)
    return {}
  if (typeof search.focus !== 'string' || search.focus.trim().length === 0)
    throw new TypeError('Note focus must be a non-empty Block id')
  return { focus: search.focus }
}

function NoteLoadingState() {
  return (
    <main {...stylex.props(editorRouteStyles.statusPage)}>
      <p {...stylex.props(editorRouteStyles.statusMessage)} role="status">Loading editor…</p>
    </main>
  )
}

export const Route = createFileRoute('/note/$noteId/$topicId')({
  component: NoteRoute,
  validateSearch: validateNoteSearch,
})

function NoteRoute() {
  const { noteId, topicId } = Route.useParams()
  const { focus } = Route.useSearch()
  usePageTitlebar(noteTitlebar)
  const editorKey = `${noteId}\0${topicId}\0${focus ?? ''}`

  return (
    <Suspense fallback={<NoteLoadingState />}>
      <NoteEditor
        key={editorKey}
        focusBlockId={focus}
        noteId={noteId}
        topicId={topicId}
      />
    </Suspense>
  )
}
