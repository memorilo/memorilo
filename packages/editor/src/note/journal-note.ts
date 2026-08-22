import type { EditorNote, EditorTopicDocument } from './editor-note'
import { Effect } from 'effect'

export interface ResolveJournalTopicOptions {
  /** When supplied, the stored Note title must exactly match this canonical date title. */
  expectedNoteTitle?: string
}

/**
 * Resolves the only editable Topic in a Journal Note and rejects structures that would expose
 * ordinary Note hierarchy or Topic-title semantics in the Journal feed.
 */
export function resolveJournalTopic(
  note: EditorNote,
  options: ResolveJournalTopicOptions = {},
): EditorTopicDocument {
  const identity = note.getIdentity()
  if (identity.kind !== 'journal')
    throw new Error(`Note ${note.id} is not a Journal Note`)
  if (options.expectedNoteTitle !== undefined && note.getTitle() !== options.expectedNoteTitle) {
    throw new Error(
      `Journal Note ${note.id} title does not match its canonical date title ${JSON.stringify(options.expectedNoteTitle)}`,
    )
  }

  const entries = note.getEntries()
  if (entries.length !== 1)
    throw new Error(`Journal Note ${note.id} must contain exactly one Topic`)

  const [entry] = entries
  if (!entry || entry.kind !== 'topic')
    throw new Error(`Journal Note ${note.id} must contain exactly one Topic and no Folders`)
  if (entry.parentId !== null)
    throw new Error(`Journal Topic ${entry.id} must be a root NoteEntry`)

  const topic = Effect.runSync(note.validateTopic(entry.id))
  if (topic.entry.title.length !== 0)
    throw new Error(`Journal Topic ${entry.id} must not have an explicit title`)

  return note.getTopic(entry.id)
}
