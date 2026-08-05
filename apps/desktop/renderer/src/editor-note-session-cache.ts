import type { EditorNote } from '@memorilo/editor'

export interface EditorNoteSessionCache {
  clear: () => void
  delete: (noteId: string) => void
  get: (noteId: string) => EditorNote | undefined
  set: (note: EditorNote) => void
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
