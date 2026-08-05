import type { PropsWithChildren } from 'react'
import { useEffect } from 'react'
import { NotePersistenceContext, notePersistenceManager } from './note-persistence-runtime'

export function NotePersistenceProvider({ children }: PropsWithChildren) {
  useEffect(() => window.desktop.subscribeNoteSaveRequests(
    () => notePersistenceManager.flush(),
  ), [])
  return (
    <NotePersistenceContext value={notePersistenceManager}>
      {children}
    </NotePersistenceContext>
  )
}
