import type { EditorNoteChange } from '@memorilo/editor'
import type { PropsWithChildren } from 'react'
import { createContext, use, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { createNotePersistenceManager } from './note-persistence-manager'

const notePersistenceManager = createNotePersistenceManager({
  adapter: window.desktop,
})

const NotePersistenceContext = createContext(notePersistenceManager)

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

export function useNotePersistence(noteId: string) {
  const manager = use(NotePersistenceContext)
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot)
  const discard = useCallback(() => manager.discard(noteId), [manager, noteId])
  const enqueue = useCallback((change: EditorNoteChange) => manager.enqueue(change), [manager])
  const getPendingChanges = useCallback(() => manager.getPendingChanges(noteId), [manager, noteId])
  return useMemo(() => ({
    discard,
    enqueue,
    error: state.pendingNoteIds.includes(noteId) ? state.error : null,
    getPendingChanges,
    retry: manager.retry,
    subscribeReceipts: manager.subscribeReceipts,
  }), [discard, enqueue, getPendingChanges, manager, noteId, state.error, state.pendingNoteIds])
}
