import type { PropsWithChildren } from 'react'
import type { NotePersistenceManager } from './note-persistence-manager'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { learningQueryKeys } from '../../learning/query-keys'
import { NotePersistenceContext } from './note-persistence-hooks'

export function NotePersistenceProvider({
  children,
  manager,
}: PropsWithChildren<{ manager: NotePersistenceManager }>) {
  const queryClient = useQueryClient()
  useEffect(() => window.desktop.subscribeNoteSaveRequests(
    () => manager.flush(),
  ), [manager])
  useEffect(() => manager.subscribeReceipts(() => {
    void queryClient.invalidateQueries({ queryKey: learningQueryKeys.notesWithCards })
  }), [manager, queryClient])
  return (
    <NotePersistenceContext value={manager}>
      {children}
    </NotePersistenceContext>
  )
}
