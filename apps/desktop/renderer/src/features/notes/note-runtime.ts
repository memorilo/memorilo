import type { DesktopNote, DesktopNoteExternalUpdate } from '@memorilo/desktop-api'
import type { EditorNote, NoteEntrySnapshot } from '@memorilo/editor/note'
import { createEditorNote } from '@memorilo/editor/note'
import { Effect } from 'effect'

export interface EditorNoteSessionCache {
  clear: () => void
  delete: (noteId: string) => void
  get: (noteId: string) => EditorNote | undefined
  set: (note: EditorNote) => void
}

export interface AppliedExternalNoteUpdate {
  entries: readonly NoteEntrySnapshot[]
  snapshot: Uint8Array
  updatedAt: number
}

export function createEditorNoteSessionCache(capacity: number): EditorNoteSessionCache {
  if (!Number.isSafeInteger(capacity) || capacity < 1)
    throw new RangeError('Editor Note session cache capacity must be a positive integer')

  const notes = new Map<string, EditorNote>()
  return {
    clear: () => notes.clear(),
    delete: (noteId) => {
      notes.delete(noteId)
    },
    get: (noteId) => {
      const note = notes.get(noteId)
      if (!note)
        return undefined
      notes.delete(noteId)
      notes.set(noteId, note)
      return note
    },
    set: (note) => {
      notes.delete(note.id)
      notes.set(note.id, note)
      while (notes.size > capacity) {
        const oldest = notes.keys().next()
        if (oldest.done)
          throw new Error('Editor Note session cache lost its least-recently-used entry')
        notes.delete(oldest.value)
      }
    },
  }
}

export function defaultTopicId(stored: DesktopNote): string {
  if (stored.kind === 'journal')
    return stored.topicId
  const note = createEditorNote({
    id: stored.id,
    snapshot: stored.snapshot,
    title: stored.title,
  })
  const topic = note.getEntries().find(entry => entry.kind === 'topic')
  if (!topic)
    throw new Error(`Note ${stored.id} does not contain a Topic`)
  return topic.id
}

export function applyExternalNoteUpdate(
  note: EditorNote,
  external: DesktopNoteExternalUpdate,
): AppliedExternalNoteUpdate | null {
  if (note.id !== external.noteId)
    return null

  const candidate = createEditorNote({ id: note.id, snapshot: note.exportSnapshot() })
  candidate.importUpdates(external.update)
  const entries = candidate.getEntries()
  for (const entry of entries) {
    if (entry.kind === 'topic')
      Effect.runSync(candidate.validateTopic(entry.id))
  }

  note.importUpdates(external.update)
  return {
    entries,
    snapshot: candidate.exportSnapshot(),
    updatedAt: external.updatedAt,
  }
}
