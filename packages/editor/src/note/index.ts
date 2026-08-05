export type {
  ApplyTopicBlockEditsInput,
  CreateEditorNoteOptions,
  CreateFolderInput,
  CreateTopicInput,
  DeleteNoteEntryInput,
  DeleteNoteEntryStrategy,
  EditorNote,
  EditorNoteChange,
  EditorNoteMutation,
  EditorNoteVersion,
  EditorTopicDocument,
  FolderSnapshot,
  MoveNoteEntryInput,
  NoteEntryKind,
  NoteEntrySnapshot,
  TopicBlockEdit,
  TopicContentProjection,
  TopicSnapshot,
  TopicValidationInput,
} from './editor-note'
export { createEditorNote } from './editor-note'
export type { ResolveJournalTopicOptions } from './journal-note'
export { resolveJournalTopic } from './journal-note'
export type { TopicBlockProjection } from './topic-projection'
export { hasTopicUserContent } from './topic-user-content'
