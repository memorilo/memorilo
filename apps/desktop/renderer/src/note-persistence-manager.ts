import type { DesktopNoteWriteReceipt, SaveDesktopNoteUpdatesInput } from '@memorilo/desktop-preload'
import type { EditorNoteChange } from '@memorilo/editor'

export interface NotePersistenceAdapter {
  saveNoteUpdates: (input: SaveDesktopNoteUpdatesInput) => Promise<DesktopNoteWriteReceipt>
}

export interface NotePersistenceState {
  error: unknown | null
  pendingNoteIds: readonly string[]
  saving: boolean
}

export interface NotePersistenceManager {
  discard: (noteId: string) => void
  enqueue: (change: EditorNoteChange) => void
  flush: () => Promise<void>
  getPendingChanges: (noteId: string) => readonly EditorNoteChange[]
  getSnapshot: () => NotePersistenceState
  retry: () => Promise<void>
  subscribe: (listener: () => void) => () => void
  subscribeReceipts: (listener: (noteId: string, receipt: DesktopNoteWriteReceipt) => void) => () => void
}

export interface CreateNotePersistenceManagerOptions {
  adapter: NotePersistenceAdapter
  debounceMs?: number
}

export function createNotePersistenceManager({
  adapter,
  debounceMs = 250,
}: CreateNotePersistenceManagerOptions): NotePersistenceManager {
  const queues = new Map<string, EditorNoteChange[]>()
  const listeners = new Set<() => void>()
  const receiptListeners = new Set<(noteId: string, receipt: DesktopNoteWriteReceipt) => void>()
  let error: unknown | null = null
  let flushPromise: Promise<void> | null = null
  let saving = false
  let state: NotePersistenceState = { error: null, pendingNoteIds: [], saving: false }
  let timer: ReturnType<typeof setTimeout> | null = null

  const notify = (): void => {
    state = { error, pendingNoteIds: [...queues.keys()], saving }
    listeners.forEach(listener => listener())
  }
  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  const waitForQueuedEditorTransactions = async (): Promise<void> => {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }

  const drain = async (): Promise<void> => {
    clearTimer()
    saving = true
    notify()
    try {
      await waitForQueuedEditorTransactions()
      while (true) {
        if (queues.size === 0) {
          await waitForQueuedEditorTransactions()
          if (queues.size === 0)
            break
        }
        const entry = queues.entries().next().value as [string, EditorNoteChange[]] | undefined
        if (!entry)
          continue
        const [noteId, queued] = entry
        queues.delete(noteId)
        try {
          const receipt = await adapter.saveNoteUpdates({
            noteId,
            updates: queued.map(change => change.update),
          })
          error = null
          receiptListeners.forEach(listener => listener(noteId, receipt))
        }
        catch (cause) {
          queues.set(noteId, [...queued, ...(queues.get(noteId) ?? [])])
          error = cause
          throw cause
        }
      }
    }
    finally {
      saving = false
      notify()
    }
  }

  const flush = (): Promise<void> => {
    if (flushPromise)
      return flushPromise
    const current = drain()
    flushPromise = current
    void current.finally(() => {
      if (flushPromise === current)
        flushPromise = null
    }).catch(() => undefined)
    return current
  }
  const schedule = (): void => {
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void flush().catch(() => undefined)
    }, debounceMs)
  }

  return {
    discard: (noteId) => {
      queues.delete(noteId)
      if (queues.size === 0)
        clearTimer()
      notify()
    },
    enqueue: (change) => {
      const queued = queues.get(change.noteId) ?? []
      queued.push(change)
      queues.set(change.noteId, queued)
      schedule()
      notify()
    },
    flush,
    getPendingChanges: noteId => [...(queues.get(noteId) ?? [])],
    getSnapshot: () => state,
    retry: flush,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    subscribeReceipts: (listener) => {
      receiptListeners.add(listener)
      return () => receiptListeners.delete(listener)
    },
  }
}
