import type {
  DeleteDesktopNoteImpact,
  DesktopNoteFavoriteState,
  DesktopNotePage,
  JournalDate,
  RenameDesktopNoteInput,
  RenameDesktopNoteResult,
  SetDesktopNoteFavoriteInput,
} from '@memorilo/desktop-api'
import type { InfiniteData } from 'effect-query'
import type { MarkdownImportValues } from '../markdown-import-dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify/unstyled'
import { desktopRequests } from '../../../shared/desktop-requests'
import { MarkdownImportDialog } from '../markdown-import-dialog'
import { defaultTopicId } from '../note-runtime'

import { noteQueryKeys } from '../query-keys'
import {
  renameNoteMutationOptions,
  setNoteFavoriteMutationOptions,
  updateFavoriteNoteCache,
  updateRenamedNoteCache,
} from './note-library-model'
import { NoteLibraryView } from './note-library-view'

async function openStoredNote(
  noteId: string,
  onOpenJournal: (journalDate: JournalDate) => Promise<void>,
  onOpenNote: (noteId: string, topicId: string) => Promise<void>,
): Promise<void> {
  const stored = await desktopRequests.getNote({ noteId })
  if (stored.kind === 'journal') {
    await onOpenJournal(stored.journalDate)
    return
  }
  const { defaultTopicId } = await import('../note-runtime')
  await onOpenNote(stored.id, defaultTopicId(stored))
}

export function NoteLibraryPage({
  onOpenJournal,
  onOpenNote,
}: {
  onOpenJournal: (journalDate: JournalDate) => Promise<void>
  onOpenNote: (noteId: string, topicId: string) => Promise<void>
}) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [markdownFile, setMarkdownFile] = useState<{ name: string, source: string } | null>(null)
  const { mutateAsync: mutateRenameNote } = useMutation({
    ...renameNoteMutationOptions(),
    onSuccess: (result) => {
      if (result.status !== 'renamed')
        return
      queryClient.setQueriesData<InfiniteData<DesktopNotePage>>(
        { queryKey: noteQueryKeys.lists },
        data => updateRenamedNoteCache(data, result.note),
      )
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.recent })
    },
  })
  const { mutateAsync: mutateFavoriteNote } = useMutation({
    ...setNoteFavoriteMutationOptions(),
    onSuccess: (state) => {
      queryClient.setQueriesData<InfiniteData<DesktopNotePage>>(
        { queryKey: noteQueryKeys.lists },
        data => updateFavoriteNoteCache(data, state),
      )
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
    },
  })
  const renameNote = useCallback(
    (input: RenameDesktopNoteInput): Promise<RenameDesktopNoteResult> => mutateRenameNote(input),
    [mutateRenameNote],
  )
  const favoriteNote = useCallback(
    (input: SetDesktopNoteFavoriteInput): Promise<DesktopNoteFavoriteState> => mutateFavoriteNote(input),
    [mutateFavoriteNote],
  )
  const getDeleteImpact = useCallback(
    (input: { noteId: string }): Promise<DeleteDesktopNoteImpact> => desktopRequests.getDeleteNoteImpact(input),
    [],
  )
  const deleteNote = useCallback(
    (input: { noteId: string }): Promise<DeleteDesktopNoteImpact> => desktopRequests.deleteNote(input),
    [],
  )
  const openSelectedNote = useCallback(
    (noteId: string) => openStoredNote(noteId, onOpenJournal, onOpenNote),
    [onOpenJournal, onOpenNote],
  )
  const importMarkdown = useCallback(() => fileInputRef.current?.click(), [])
  const confirmMarkdownImport = useCallback(async (values: MarkdownImportValues) => {
    const created = await desktopRequests.createNote({
      initialTopic: { initialContent: values.document, mode: 0, title: values.topicTitle },
      title: values.noteTitle,
    })
    setMarkdownFile(null)
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
    if (values.diagnostics.length > 0) {
      toast.warning(values.diagnostics.map(diagnostic => `L${diagnostic.line}: ${diagnostic.message}`).join('\n'), { autoClose: 10_000 })
    }
    await onOpenNote(created.id, defaultTopicId(created))
  }, [onOpenNote, queryClient])
  const commands = useMemo(() => ({
    favorite: favoriteNote,
    importMarkdown,
    open: openSelectedNote,
    rename: renameNote,
    getDeleteImpact,
    delete: deleteNote,
  }), [deleteNote, favoriteNote, getDeleteImpact, importMarkdown, openSelectedNote, renameNote])

  return (
    <>
      <NoteLibraryView commands={commands} />
      <input
        ref={fileInputRef}
        accept=".md,.markdown,text/markdown"
        hidden
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file)
            return
          void file.text().then(source => setMarkdownFile({ name: file.name, source }))
        }}
      />
      {markdownFile
        ? <MarkdownImportDialog fileName={markdownFile.name} onClose={() => setMarkdownFile(null)} onConfirm={confirmMarkdownImport} source={markdownFile.source} target="new-note" />
        : null}
    </>
  )
}
