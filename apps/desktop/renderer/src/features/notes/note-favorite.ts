import type { DesktopNote } from '@memorilo/desktop-preload'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { desktopEffect, desktopEffectQuery } from '../../shared/effect-query'
import { noteQueryKeys } from './query-keys'

export function useNoteFavorite(note: Pick<DesktopNote, 'favorite' | 'id'>) {
  const queryClient = useQueryClient()
  const [favorite, setFavorite] = useState(note.favorite)
  const { isPending, mutate } = useMutation(desktopEffectQuery.mutationOptions({
    mutationFn: (nextFavorite: boolean) => desktopEffect('notes.set-favorite', () => (
      window.desktop.setNoteFavorite({
        favorite: nextFavorite,
        noteId: note.id,
      })
    )),
    onSuccess: (state) => {
      setFavorite(state.favorite)
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
    },
  }))

  const toggleFavorite = useCallback(() => {
    mutate(!favorite)
  }, [favorite, mutate])

  return {
    favorite,
    favoritePending: isPending,
    toggleFavorite,
  }
}
