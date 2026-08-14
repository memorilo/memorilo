import type { JournalDate } from '@memorilo/desktop-preload'
import * as stylex from '@stylexjs/stylex'
import { lazy, Suspense, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePageTitlebar } from '../../../shared/page-titlebar'
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
  onOpenTopic,
  topicId,
}: {
  focus?: string
  noteId: string
  onOpenJournal: (journalDate: JournalDate) => Promise<void>
  onOpenTopic: (topicId: string) => Promise<void>
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
      onOpenTopic={onOpenTopic}
    />
  )
}

function NoteWorkspace({
  focus,
  noteId,
  onOpenJournal,
  onOpenTopic,
  topicId,
}: {
  focus?: string
  noteId: string
  onOpenJournal: (journalDate: JournalDate) => Promise<void>
  onOpenTopic: (topicId: string) => Promise<void>
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
        onOpenJournal={onOpenJournal}
        onOpenTopic={onOpenTopic}
        onToggleEntry={toggleEntry}
        topicId={topicId}
      />
    </Suspense>
  )
}
