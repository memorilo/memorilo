import type { EditorNoteChange } from '@memorilo/editor'
import type { NotePersistenceManager } from './note-persistence-manager'
import { createContext, use, useCallback, useSyncExternalStore } from 'react'

export const NotePersistenceContext = createContext<NotePersistenceManager | null>(null)

function useNotePersistenceManager() {
  const manager = use(NotePersistenceContext)
  if (!manager)
    throw new Error('Note persistence is unavailable outside NotePersistenceProvider')
  return manager
}

export function useNotePersistence(noteId: string) {
  const manager = useNotePersistenceManager()
  useSyncExternalStore(manager.subscribe, manager.getSnapshot)
  const enqueue = useCallback((change: EditorNoteChange) => manager.enqueue(change), [manager])
  const getPendingChanges = useCallback(() => manager.getPendingChanges(noteId), [manager, noteId])
  const replacePending = useCallback(
    (update: Uint8Array) => manager.replacePending({ noteId, update }),
    [manager, noteId],
  )
  return {
    enqueue,
    error: manager.getError(noteId),
    getPendingChanges,
    replacePending,
    retry: manager.retry,
    subscribeReceipts: manager.subscribeReceipts,
  }
}

export function useFlushNotePersistence() {
  const manager = useNotePersistenceManager()
  return manager.flush
}
