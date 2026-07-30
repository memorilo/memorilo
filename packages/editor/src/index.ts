export { demoEditorAdapters } from './adapters/demo-adapters'
export type { EditorAdapters, EditorTag, EditorTagStorage, ImageUploadInput } from './adapters/editor-adapters'
export { EditorMode } from './common/editor-mode'
export type { EditorModeName, EditorModeValue } from './common/editor-mode'
export type { OutlineFocusTarget, OutlineOptions } from './common/outline-runtime'
export { Editor } from './editor'
export type { EditorFocusTarget, EditorProps } from './editor'
export type {
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
  TopicContentProjection,
  TopicSnapshot,
} from './note/editor-note'
export { createEditorNote } from './note/editor-note'
export type { TopicBlockProjection } from './note/topic-projection'
export { projectTopicBlocks } from './note/topic-projection'
