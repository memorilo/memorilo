import type { PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { NotePersistenceContext, notePersistenceManager } from './note-persistence-runtime'
import { learningQueryKeys } from './queries/learning-query-keys'

export function NotePersistenceProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  useEffect(() => window.desktop.subscribeNoteSaveRequests(
    () => notePersistenceManager.flush(),
  ), [])
  useEffect(() => notePersistenceManager.subscribeReceipts(() => {
    void queryClient.invalidateQueries({ queryKey: learningQueryKeys.notesWithCards })
  }), [queryClient])
  return (
    <NotePersistenceContext value={notePersistenceManager}>
      {children}
    </NotePersistenceContext>
  )
}
