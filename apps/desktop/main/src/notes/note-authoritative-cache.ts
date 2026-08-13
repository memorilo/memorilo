import type {
  EditorStorage,
  JournalDate,
  StoredNote,
} from '@memorilo/editor-storage'
import type {
  EditorNote,
} from '@memorilo/editor/note'
import { runLifecycleOperations } from '@memorilo/effect-lifecycle'

export interface AuthoritativeNote {
  checkpointSequence: number
  createdAt: number
  journalDate: JournalDate | null
  latestSequence: number
  note: EditorNote
  updatedAt: number
}

export interface NoteAuthoritativeCacheOptions {
  capacity: number
  checkpointInterval: number
  storage: EditorStorage
  onCheckpointFailure?: (note: AuthoritativeNote, error: unknown) => void
}

export interface NoteAuthoritativeCache {
  checkpointIfNeeded: (current: AuthoritativeNote) => Promise<void>
  flush: () => Promise<void>
  get: (noteId: string) => AuthoritativeNote | undefined
  invalidate: (noteId: string) => void
  load: (
    stored: StoredNote,
    restore: () => Promise<AuthoritativeNote>,
  ) => Promise<AuthoritativeNote>
  touch: (current: AuthoritativeNote) => Promise<AuthoritativeNote>
  clear: () => void
}

export function createNoteAuthoritativeCache(
  options: NoteAuthoritativeCacheOptions,
): NoteAuthoritativeCache {
  if (!Number.isInteger(options.capacity) || options.capacity < 1)
    throw new RangeError('Note cache capacity must be a positive integer')
  if (!Number.isInteger(options.checkpointInterval) || options.checkpointInterval < 1)
    throw new RangeError('Note checkpoint interval must be a positive integer')

  const cache = new Map<string, AuthoritativeNote>()

  const checkpoint = async (current: AuthoritativeNote, propagateFailure: boolean): Promise<void> => {
    if (current.latestSequence === current.checkpointSequence)
      return
    try {
      const receipt = await options.storage.notes.checkpointNote({
        noteId: current.note.id,
        snapshot: current.note.exportSnapshot(),
        throughSequence: current.latestSequence,
      })
      current.checkpointSequence = current.latestSequence
      current.updatedAt = receipt.updatedAt
    }
    catch (error) {
      options.onCheckpointFailure?.(current, error)
      if (propagateFailure)
        throw error
    }
  }

  const touch = async (current: AuthoritativeNote): Promise<AuthoritativeNote> => {
    cache.delete(current.note.id)
    cache.set(current.note.id, current)
    if (cache.size <= options.capacity)
      return current

    const leastRecentlyUsedId = cache.keys().next().value
    if (leastRecentlyUsedId === undefined)
      return current
    const leastRecentlyUsed = cache.get(leastRecentlyUsedId)
    cache.delete(leastRecentlyUsedId)
    if (leastRecentlyUsed)
      await checkpoint(leastRecentlyUsed, false)
    return current
  }

  const load = async (
    stored: StoredNote,
    restore: () => Promise<AuthoritativeNote>,
  ): Promise<AuthoritativeNote> => {
    const cached = cache.get(stored.id)
    if (cached && cached.latestSequence === stored.latestSequence)
      return touch(cached)
    if (cached) {
      cache.delete(stored.id)
      await checkpoint(cached, false)
    }
    return touch(await restore())
  }

  return {
    checkpointIfNeeded: async (current) => {
      if (current.latestSequence - current.checkpointSequence >= options.checkpointInterval)
        await checkpoint(current, true)
    },
    flush: async () => {
      await runLifecycleOperations(
        [...cache.values()].map(current => () => checkpoint(current, true)),
        'Failed to checkpoint cached Notes',
        'sequential',
      )
    },
    get: noteId => cache.get(noteId),
    invalidate: (noteId) => {
      cache.delete(noteId)
    },
    load,
    touch,
    clear: () => {
      cache.clear()
    },
  }
}
