export type { DatabaseCommand, DatabaseValue, EditorStorageDatabase } from './database-driver'
export type {
  CheckpointNoteInput,
  CreateEditorStorageOptions,
  EditorStorage,
  FolderProjection,
  GetTopicBlockInput,
  IndexPendingEmbeddingsInput,
  NoteEntryProjection,
  NoteWriteReceipt,
  SaveNoteUpdatesInput,
  SearchTopicBlocksInput,
  StoredNote,
  StoredNoteUpdate,
  StoredTopicBlock,
  TopicBlockProjection,
  TopicBlockSearchHit,
  TopicBlockSearchMode,
  TopicContentProjection,
  TopicEditorMode,
  TopicProjection,
} from './editor-storage'
export { createEditorStorage } from './editor-storage'
export type { EmbeddingModel } from './embedding-model'
