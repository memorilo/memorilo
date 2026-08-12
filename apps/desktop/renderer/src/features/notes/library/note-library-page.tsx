import type {
  DesktopNoteFavoriteState,
  DesktopNotePage,
  JournalDate,
  RenameDesktopNoteInput,
  RenameDesktopNoteResult,
  SetDesktopNoteFavoriteInput,
} from '@memorilo/desktop-preload'
import type { InfiniteData } from 'effect-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

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
  const stored = await window.desktop.getNote({ noteId })
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
  const openSelectedNote = useCallback(
    (noteId: string) => openStoredNote(noteId, onOpenJournal, onOpenNote),
    [onOpenJournal, onOpenNote],
  )
  const commands = useMemo(() => ({
    favorite: favoriteNote,
    open: openSelectedNote,
    rename: renameNote,
  }), [favoriteNote, openSelectedNote, renameNote])

  return <NoteLibraryView commands={commands} />
}
