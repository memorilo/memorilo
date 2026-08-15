import type { PropsWithChildren } from 'react'
import type { NotePersistenceManager } from './note-persistence-manager'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useDesktopConfiguration } from '../../../shared/configuration'
import { NotePersistenceContext } from './note-persistence-hooks'

export function NotePersistenceProvider({
  children,
  manager,
}: PropsWithChildren<{ manager: NotePersistenceManager }>) {
  const queryClient = useQueryClient()
  const learningEnabled = useDesktopConfiguration().learning.enabled
  useEffect(() => window.desktop.subscribeNoteSaveRequests(
    () => manager.flush(),
  ), [manager])
  useEffect(() => manager.subscribeReceipts(() => {
    if (!learningEnabled)
      return
    void import('../../learning/query-keys').then(({ learningQueryKeys }) => {
      void queryClient.invalidateQueries({ queryKey: learningQueryKeys.notesWithCards })
    })
  }), [learningEnabled, manager, queryClient])
  return (
    <NotePersistenceContext value={manager}>
      {children}
    </NotePersistenceContext>
  )
}
