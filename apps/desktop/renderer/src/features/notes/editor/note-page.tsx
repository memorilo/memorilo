import type { JournalDate } from '@memorilo/desktop-preload'
import * as stylex from '@stylexjs/stylex'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { usePageTitlebar } from '../../../shared/page-titlebar'
import { useNoteInspectorEntries } from '../note-inspector-state'
import { noteSharedStyles } from './note-shared.stylex'

const NoteEditor = lazy(async () => {
  const module = await import('./note-editor')
  return { default: module.NoteEditor }
})
export interface NoteSearch {
  focus?: string
}

function NoteLoadingState() {
  const { t } = useTranslation('editor')
  return (
    <main {...stylex.props(noteSharedStyles.statusPage)}>
      <p {...stylex.props(noteSharedStyles.statusMessage)} role="status">{t('loadingEditor')}</p>
    </main>
  )
}

export function NotePage({
  focus,
  noteId,
  onOpenJournal,
  topicId,
}: {
  focus?: string
  noteId: string
  onOpenJournal: (journalDate: JournalDate) => Promise<void>
  topicId: string
}) {
  const { t } = useTranslation('editor')
  usePageTitlebar({ title: t('noteTitle') })

  return (
    <NoteWorkspace
      key={noteId}
      focus={focus}
      noteId={noteId}
      topicId={topicId}
      onOpenJournal={onOpenJournal}
    />
  )
}

function NoteWorkspace({
  focus,
  noteId,
  onOpenJournal,
  topicId,
}: {
  focus?: string
  noteId: string
  onOpenJournal: (journalDate: JournalDate) => Promise<void>
  topicId: string
}) {
  const { collapsedEntryIds, toggleEntry } = useNoteInspectorEntries(noteId)
  const editorKey = `${noteId}\0${topicId}\0${focus ?? ''}`

  return (
    <Suspense fallback={<NoteLoadingState />}>
      <NoteEditor
        key={editorKey}
        collapsedEntryIds={collapsedEntryIds}
        focusBlockId={focus}
        noteId={noteId}
        onOpenJournal={onOpenJournal}
        onToggleEntry={toggleEntry}
        topicId={topicId}
      />
    </Suspense>
  )
}
