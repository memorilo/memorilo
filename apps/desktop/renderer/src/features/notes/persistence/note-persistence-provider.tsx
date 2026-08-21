import type { PropsWithChildren } from 'react'
import type { NotePersistenceManager } from './note-persistence-manager'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useDesktopConfiguration } from '../../../shared/configuration'
import { journalQueryKeys } from '../../journals/query-keys'
import { todoQueryKeys } from '../../todo/query-keys'
import { noteQueryKeys } from '../query-keys'
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
  useEffect(() => window.desktop.subscribeNoteUpdates(() => {
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.recent })
    void queryClient.invalidateQueries({ queryKey: journalQueryKeys.all })
    void queryClient.invalidateQueries({ queryKey: todoQueryKeys.all })
    if (learningEnabled) {
      void import('../../learning/query-keys').then(({ learningQueryKeys }) => {
        void queryClient.invalidateQueries({ queryKey: learningQueryKeys.notesWithCards })
      })
    }
  }), [learningEnabled, queryClient])
  useEffect(() => window.desktop.subscribeLearningUpdates(() => {
    void queryClient.invalidateQueries({ queryKey: ['learning'] })
  }), [queryClient])
  return (
    <NotePersistenceContext value={manager}>
      {children}
    </NotePersistenceContext>
  )
}
