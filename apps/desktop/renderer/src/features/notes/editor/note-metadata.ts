import type { DesktopRegularNote } from '@memorilo/desktop-api'
import type { EditorNote } from '@memorilo/editor'
import type { DesktopClientError } from '../../../shared/effect-query'
import type { EditorNoteSessionOpened, EditorStoredNotePatch } from './note-editor-session'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopRequests } from '../../../shared/desktop-requests'
import {
  desktopEffect,
  desktopEffectQuery,
} from '../../../shared/effect-query'
import { noteQueryKeys } from '../query-keys'

function setNoteFavoriteMutationOptions() {
  return desktopEffectQuery.mutationOptions<
    { favorite: boolean, noteId: string },
    DesktopClientError,
    never,
    { favorite: boolean, note: EditorNote, noteId: string }
  >({
    mutationFn: input => desktopEffect('notes.set-favorite', () => desktopRequests.setNoteFavorite({
      favorite: input.favorite,
      noteId: input.noteId,
    })),
  })
}

export function useNoteMetadata(
  opened: EditorNoteSessionOpened<DesktopRegularNote> | null,
  updateStored: (
    expectedNote: EditorNote,
    patch: EditorStoredNotePatch<DesktopRegularNote>,
  ) => boolean,
) {
  const { t } = useTranslation('pages')
  const queryClient = useQueryClient()
  const { isPending: favoritePending, mutate: mutateFavorite } = useMutation({
    ...setNoteFavoriteMutationOptions(),
    onSuccess: (state, input) => {
      updateStored(input.note, { favorite: state.favorite })
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
    },
  })

  const renameNote = useCallback(async (note: EditorNote, title: string) => {
    const result = await desktopRequests.renameNote({ noteId: note.id, title })
    if (result.status === 'duplicate-title')
      return { error: t('duplicateTitle') }
    if (result.status === 'journal-title-immutable')
      throw new Error(`Regular Note ${note.id} was unexpectedly classified as Journal ${result.journalDate}`)

    if (!updateStored(note, {
      title: result.note.title,
      updatedAt: result.note.updatedAt,
    })) {
      return
    }
    note.renameNote(result.note.title)
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.recent })
  }, [queryClient, t, updateStored])

  const toggleFavorite = useCallback(() => {
    if (!opened)
      return
    mutateFavorite({
      favorite: !opened.stored.favorite,
      note: opened.note,
      noteId: opened.stored.id,
    })
  }, [mutateFavorite, opened])

  return { favoritePending, renameNote, toggleFavorite }
}
