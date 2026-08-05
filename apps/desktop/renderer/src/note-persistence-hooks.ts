import type { EditorNoteChange } from '@memorilo/editor'
import { use, useCallback, useMemo, useSyncExternalStore } from 'react'

import { NotePersistenceContext } from './note-persistence-runtime'

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

export function useFlushNotePersistence() {
  const manager = use(NotePersistenceContext)
  return manager.flush
}
