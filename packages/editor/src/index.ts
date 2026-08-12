export { demoEditorAdapters } from './adapters/demo-adapters'
export type { EditorAdapters, EditorTag, EditorTagStorage, ImageUploadInput } from './adapters/editor-adapters'
export type {
  AddClozeInput,
  CardExtension,
  CardExtensionOptions,
  ClozeIdentity,
  CreateCardId,
  InsertBasicCardInput,
  SetCardDirectionInput,
  SetCardPresentationInput,
  SetHighlightInput,
} from './card/card-extension'
export { defineCardExtension } from './card/card-extension'
export type {
  BasicCardDirection,
  BasicEditorCardProjection,
  CardAnswerPresentation,
  CardBlockAttrs,
  CardDelimiterAttrs,
  CardPracticeDirection,
  ClozeEditorCardProjection,
  ClozeMarkAttrs,
  EditorCardProjection,
  HighlightColor,
  InlineHighlightMarkAttrs,
  MultiLineCardItemProjection,
  MultiLineEditorCardProjection,
} from './card/card-model'
export { projectEditorCards } from './card/card-model'
export type { CardPreviewItemSelection, CardPreviewMode, CardPreviewProps } from './card/card-preview'
export { CardPreview } from './card/card-preview'
export type {
  EditorCardRecord,
  EditorCardRepository,
  EditorCardSearchInput,
  ReplaceTopicCardsInput,
} from './card/card-repository'
export { createMemoryEditorCardRepository } from './card/card-repository'
export type {
  CardSurfaceItemSelection,
  CardSurfaceProps,
  CardSurfaceSide,
} from './card/card-surface'
export { CardSurface } from './card/card-surface'
export type {
  EditorCardIntegration,
  EditorCardSync,
  EditorCardSyncError,
} from './card/card-sync'
export { createEditorCardSync } from './card/card-sync'
export { EditorMode } from './common/editor-mode'
export type { EditorModeName, EditorModeValue } from './common/editor-mode'
export type { OutlineFocusTarget, OutlineOptions } from './common/outline-runtime'
export { Editor } from './editor'
export type { EditorFocusTarget, EditorLayout, EditorProps } from './editor'
export { JournalEditor } from './journal-editor'
export type { JournalEditorProps } from './journal-editor'
export type {
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
  TopicContentProjection,
  TopicSnapshot,
  TopicValidationInput,
  WhiteboardScene,
  WhiteboardTopicSnapshot,
  WhiteboardTopicValidationInput,
} from './note/editor-note'
export { createEditorNote } from './note/editor-note'
export type { ResolveJournalTopicOptions } from './note/journal-note'
export { resolveJournalTopic } from './note/journal-note'
export type { TopicBlockProjection } from './note/topic-projection'
export { projectTopicBlocks } from './note/topic-projection'
export { hasTopicUserContent } from './note/topic-user-content'
export { useEditorTopicMode } from './note/use-editor-topic-mode'
export type {
  LoroBookTopic,
  LoroRegularTopic,
  LoroTopic,
  LoroTopicDocument,
  LoroTopicMarkType,
  LoroTopicNode,
  LoroTopicNodeType,
  LoroTopicValidation,
  LoroWhiteboardTopic,
} from './schema'
export {
  isLoroTopic,
  LoroBookTopicEntrySchema,
  LoroRegularTopicEntrySchema,
  LoroTopicDocumentSchema,
  LoroTopicEntrySchema,
  LoroTopicNodeSchema,
  LoroTopicSchema,
  LoroWhiteboardTopicEntrySchema,
  validateLoroTopic,
} from './schema'
