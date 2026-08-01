import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePageTitlebar } from '../components/page-titlebar'
import { editorRouteStyles } from './-note.stylex'

const NoteEditor = lazy(async () => {
  const module = await import('./-note-editor')
  return { default: module.NoteEditor }
})

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
  const { t } = useTranslation('editor')
  return (
    <main {...stylex.props(editorRouteStyles.statusPage)}>
      <p {...stylex.props(editorRouteStyles.statusMessage)} role="status">{t('loadingEditor')}</p>
    </main>
  )
}

export const Route = createFileRoute('/note/$noteId/$topicId')({
  component: NoteRoute,
  validateSearch: validateNoteSearch,
})

function NoteRoute() {
  const { t } = useTranslation('editor')
  const { noteId, topicId } = Route.useParams()
  const { focus } = Route.useSearch()
  usePageTitlebar({ title: t('noteTitle') })

  return <NoteWorkspace key={noteId} focus={focus} noteId={noteId} topicId={topicId} />
}

function NoteWorkspace({
  focus,
  noteId,
  topicId,
}: {
  focus?: string
  noteId: string
  topicId: string
}) {
  const [collapsedEntryIds, setCollapsedEntryIds] = useState<ReadonlySet<string>>(() => new Set())
  const toggleEntry = useCallback((entryId: string) => {
    setCollapsedEntryIds((current) => {
      const next = new Set(current)
      if (next.has(entryId))
        next.delete(entryId)
      else
        next.add(entryId)
      return next
    })
  }, [])
  const editorKey = `${noteId}\0${topicId}\0${focus ?? ''}`

  return (
    <Suspense fallback={<NoteLoadingState />}>
      <NoteEditor
        key={editorKey}
        collapsedEntryIds={collapsedEntryIds}
        focusBlockId={focus}
        noteId={noteId}
        onToggleEntry={toggleEntry}
        topicId={topicId}
      />
    </Suspense>
  )
}
