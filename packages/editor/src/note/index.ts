export type {
  ApplyTopicBlockEditsInput,
  BookTopicSnapshot,
  BookTopicValidationInput,
  CreateBookTopicInput,
  CreateEditorNoteOptions,
  CreateEmbeddedEditorInput,
  CreateFolderInput,
  CreateTopicInput,
  CreateWhiteboardTopicInput,
  DeleteNoteEntryInput,
  DeleteNoteEntryStrategy,
  EditorBookTopicDocument,
  EditorEmbeddedDocument,
  EditorNote,
  EditorNoteChange,
  EditorNoteMutation,
  EditorNoteVersion,
  EditorTopicDocument,
  EditorWhiteboardTopicDocument,
  EmbeddedEditorSnapshot,
  FolderSnapshot,
  MoveNoteEntryInput,
  NoteEntryKind,
  NoteEntrySnapshot,
  RegularTopicSnapshot,
  RegularTopicValidationInput,
  TopicBlockEdit,
  TopicContentProjection,
  TopicSnapshot,
  TopicValidationInput,
  WhiteboardScene,
  WhiteboardTopicSnapshot,
  WhiteboardTopicValidationInput,
} from './editor-note'
export { createEditorNote } from './editor-note'
export { whiteboardSceneSignature } from './editor-note-whiteboard'
export type { ResolveJournalTopicOptions } from './journal-note'
export { resolveJournalTopic } from './journal-note'
export type { TopicBlockProjection } from './topic-projection'
export { hasTopicUserContent } from './topic-user-content'
export type {
  WhiteboardLibraryDocument,
  WhiteboardLibraryElement,
  WhiteboardLibraryItem,
} from './whiteboard-library-document'
export {
  createWhiteboardLibraryDocument,
  whiteboardLibrarySchemaVersion,
} from './whiteboard-library-document'
