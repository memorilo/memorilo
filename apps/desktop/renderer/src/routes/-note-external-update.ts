import type { DesktopNoteExternalUpdate } from '@memorilo/desktop-preload'
import type { EditorNote, NoteEntrySnapshot } from '@memorilo/editor'
import { createEditorNote } from '@memorilo/editor'
import { Effect } from 'effect'

export interface AppliedExternalNoteUpdate {
  entries: readonly NoteEntrySnapshot[]
  snapshot: Uint8Array
  updatedAt: number
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
