import type { DesktopRegularNote, JournalDate } from '@memorilo/desktop-preload'
import type { ShelfReadingFormat } from '@memorilo/shelf'
import type { BookPickerTarget, EntryCreationTarget, ShelfBookOption } from './note-editor-dialogs'
import { EditorMode } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toast } from 'react-toastify/unstyled'
import { noteQueryKeys } from '../query-keys'
import { BookTopicPickerDialog, EntryCreationDialog } from './note-editor-dialogs'
import { useEditorNoteSession } from './note-editor-session'
import { NoteEditorView } from './note-editor-view'
import { useNoteMetadata } from './note-metadata'
import { noteSharedStyles } from './note-shared.stylex'

export function NoteEditor({
  collapsedEntryIds,
  focusBlockId,
  noteId,
  onOpenJournal,
  onToggleEntry,
  topicId,
}: {
  collapsedEntryIds: ReadonlySet<string>
  focusBlockId?: string
  noteId: string
  onOpenJournal: (journalDate: JournalDate) => Promise<void>
  onToggleEntry: (entryId: string) => void
  topicId: string
}) {
  const { t } = useTranslation(['editor', 'pages'])
  const queryClient = useQueryClient()
  const [bookPickerTarget, setBookPickerTarget] = useState<BookPickerTarget | undefined>(undefined)
  const [entryCreationTarget, setEntryCreationTarget] = useState<EntryCreationTarget | undefined>(undefined)
  const loadNote = useCallback(async (): Promise<DesktopRegularNote> => {
    const stored = await window.desktop.getNote({ noteId })
    if (stored.kind === 'journal') {
      await onOpenJournal(stored.journalDate)
      throw new Error(`Journal ${stored.journalDate} must open in the Journal feed`)
    }
    return stored
  }, [noteId, onOpenJournal])
  const handleExternalUpdate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
  }, [queryClient])
  const session = useEditorNoteSession<DesktopRegularNote>({
    loadNote,
    noteId,
    onExternalUpdate: handleExternalUpdate,
    topicId,
  })
  const { loadError, opened, saveError, updateStored, validationError } = session
  const metadata = useNoteMetadata(opened, updateStored)
  const openedNoteId = opened?.note.id
  const openedTopicId = opened?.topic.topicId

  useEffect(() => {
    if (!openedNoteId || !openedTopicId)
      return
    const recording = window.desktop.recordNoteOpened({
      noteId: openedNoteId,
      topicId: openedTopicId,
    }).then(() => queryClient.invalidateQueries({ queryKey: noteQueryKeys.recent }))
    void recording.then(undefined, error => console.error('Failed to record opened Note', error))
  }, [openedNoteId, openedTopicId, queryClient])

  const handleCreateBookTopic = useCallback(async (
    option: ShelfBookOption,
    format: ShelfReadingFormat,
    parentId: string | null,
  ) => {
    if (!opened)
      throw new Error('The Note is no longer open')
    const prepared = await window.desktop.prepareShelfReading({
      format,
      publicationId: option.publication.id,
      retention: 'library',
      sourceId: option.source.id,
    })
    opened.note.createBookTopic({
      book: prepared.book,
      mode: EditorMode.Document,
      parentId,
      title: option.publication.title,
    })
    setBookPickerTarget(undefined)
    toast.success(t('bookTopicCreated', { ns: 'editor' }), { autoClose: 5_000 })
  }, [opened, t])

  const handleCreateEntry = useCallback((target: EntryCreationTarget, label: string) => {
    if (!opened)
      throw new Error('The Note is no longer open')
    if (target.kind === 'folder')
      opened.note.createFolder({ name: label, parentId: target.parentId })
    else if (target.kind === 'whiteboard')
      opened.note.createWhiteboardTopic({ parentId: target.parentId, title: label })
    else
      opened.note.createTopic({ mode: EditorMode.Document, parentId: target.parentId, title: label })
    setEntryCreationTarget(undefined)
  }, [opened])

  const handleRebindBookTopic = useCallback(async (
    option: ShelfBookOption,
    format: ShelfReadingFormat,
    topicId: string,
  ) => {
    if (!opened)
      throw new Error('The Note is no longer open')
    const bookTopic = opened.note.getBookTopic(topicId)
    const currentBook = bookTopic.getBook()
    if (format !== currentBook.file.format)
      throw new Error(`BookTopic format must remain ${currentBook.file.format}`)
    const prepared = await window.desktop.prepareShelfReading({
      format,
      publicationId: option.publication.id,
      retention: 'library',
      sourceId: option.source.id,
    })
    bookTopic.rebind(prepared.book)
    setBookPickerTarget(undefined)
    toast.warning(t('bookTopicRebound', { ns: 'editor' }))
  }, [opened, t])

  if (loadError) {
    return (
      <main {...stylex.props(noteSharedStyles.statusPage)}>
        <p {...stylex.props(noteSharedStyles.statusMessage, noteSharedStyles.errorMessage)} role="alert">
          {t('failedToOpenNote', { message: loadError })}
        </p>
      </main>
    )
  }
  if (!opened) {
    return (
      <main {...stylex.props(noteSharedStyles.statusPage)}>
        <p {...stylex.props(noteSharedStyles.statusMessage)} role="status">{t('openingNote')}</p>
      </main>
    )
  }

  return (
    <>
      <NoteEditorView
        collapsedEntryIds={collapsedEntryIds}
        favoritePending={metadata.favoritePending}
        focusBlockId={focusBlockId}
        onAddBook={parentId => setBookPickerTarget({ kind: 'create', parentId })}
        onAddFolder={parentId => setEntryCreationTarget({ kind: 'folder', parentId })}
        onAddTopic={parentId => setEntryCreationTarget({ kind: 'topic', parentId })}
        onAddWhiteboard={parentId => setEntryCreationTarget({ kind: 'whiteboard', parentId })}
        onRebindBook={(topicId) => {
          const format = opened.note.getBookTopic(topicId).getBook().file.format
          setBookPickerTarget({ format, kind: 'rebind', topicId })
        }}
        onRenameNote={metadata.renameNote}
        onToggleEntry={onToggleEntry}
        onToggleFavorite={metadata.toggleFavorite}
        opened={opened}
        saveError={saveError}
        validationError={validationError}
      />
      {bookPickerTarget !== undefined
        ? (
            <BookTopicPickerDialog
              mode={bookPickerTarget.kind}
              requiredFormat={bookPickerTarget.kind === 'rebind' ? bookPickerTarget.format : undefined}
              onClose={() => setBookPickerTarget(undefined)}
              onCreate={(option, format) => bookPickerTarget.kind === 'create'
                ? handleCreateBookTopic(option, format, bookPickerTarget.parentId)
                : handleRebindBookTopic(option, format, bookPickerTarget.topicId)}
            />
          )
        : null}
      {entryCreationTarget !== undefined
        ? (
            <EntryCreationDialog
              kind={entryCreationTarget.kind}
              onClose={() => setEntryCreationTarget(undefined)}
              onCreate={label => handleCreateEntry(entryCreationTarget, label)}
            />
          )
        : null}
    </>
  )
}
