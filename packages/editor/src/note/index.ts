export type {
  ApplyTopicBlockEditsInput,
  BookTopicSnapshot,
  BookTopicValidationInput,
  CreateBookTopicInput,
  CreateEditorNoteOptions,
  CreateFolderInput,
  CreateImageOcclusionTopicInput,
  CreateTopicInput,
  DeleteNoteEntryInput,
  DeleteNoteEntryStrategy,
  EditorBookTopicDocument,
  EditorImageOcclusionTopicDocument,
  EditorNote,
  EditorNoteChange,
  EditorNoteMutation,
  EditorNoteVersion,
  EditorOpenedTopic,
  EditorTopicDocument,
  FolderSnapshot,
  ImageOcclusionTopicSnapshot,
  ImageOcclusionTopicValidationInput,
  MoveNoteEntryInput,
  NoteEntryKind,
  NoteEntrySnapshot,
  RegularTopicSnapshot,
  RegularTopicValidationInput,
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
