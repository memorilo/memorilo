import type { OperationSupervisor } from '@memorilo/effect-lifecycle'
import type { BookFileBinding, BookFileDescriptor } from '@memorilo/reading-model'
import type { EditorStorageDatabase } from './database-driver'
import type { EmbeddingModel } from './embedding-model'
import type {
  LearningPracticeConfiguration,
  LearningStorage,
  LearningTopicCardProjection,
} from './learning'

export interface FolderProjection {
  id: string
  kind: 'folder'
  name: string
  ordinal: number
  parentId: string | null
}

export type TopicEditorMode = 0 | 1

interface TopicProjectionBase {
  id: string
  kind: 'topic'
  mode: TopicEditorMode
  ordinal: number
  parentId: string | null
  title: string
}

export interface RegularTopicProjection extends TopicProjectionBase {
  topicType: 'regular'
}

export interface BookTopicProjection extends TopicProjectionBase {
  book: BookFileBinding
  topicType: 'book'
}

export interface ImageOcclusionTopicProjection extends TopicProjectionBase {
  topicType: 'image-occlusion'
}

export type TopicProjection = BookTopicProjection | ImageOcclusionTopicProjection | RegularTopicProjection

export type NoteEntryProjection = FolderProjection | TopicProjection

export interface TopicBlockProjection {
  attributes: Readonly<Record<string, unknown>>
  id: string
  kind: string
  ordinal: number
  parentId: string | null
  text: string
}

export interface TopicContentProjection {
  blocks: readonly TopicBlockProjection[]
  title: string
  topicId: string
}

export interface StoredNoteUpdate {
  sequence: number
  update: Uint8Array
}

export interface StoredNote {
  checkpointSequence: number
  createdAt: number
  id: string
  latestSequence: number
  snapshot: Uint8Array | null
  title: string
  updatedAt: number
  updates: readonly StoredNoteUpdate[]
}

export interface BookTopicContext {
  book: BookFileBinding
  noteId: string
  noteTitle: string
  topicId: string
  topicTitle: string
}

export type BookFileFingerprint = Pick<BookFileDescriptor, 'format' | 'sha256'>

export interface CreateNoteInput {
  title?: string
}

export interface CreateInitializedNoteInput {
  entries: readonly NoteEntryProjection[]
  id: string
  learningCards?: readonly LearningTopicCardProjection[]
  snapshot: Uint8Array
  title: string
  topics: readonly TopicContentProjection[]
}

export type JournalDate = string

export type GetOrCreateJournalInput = Omit<CreateInitializedNoteInput, 'title'> & {
  journalDate: JournalDate
}

export type JournalCreationStatus = 'created' | 'existing'

export interface StoredJournal {
  journalDate: JournalDate
  note: StoredNote
  status: JournalCreationStatus
}

export interface JournalMetadata {
  hasUserContent: boolean
  journalDate: JournalDate
  noteId: string
}

export interface ListPastJournalsInput {
  before?: JournalDate
  limit?: number
  today: JournalDate
}

export interface StoredJournalSummary {
  createdAt: number
  journalDate: JournalDate
  noteId: string
  title: string
  topicId: string
  updatedAt: number
}

export interface StoredJournalPage {
  items: readonly StoredJournalSummary[]
  nextCursor: JournalDate | null
}

export interface ListJournalDatesInput {
  from: JournalDate
  through: JournalDate
}

export interface PrunePastEmptyJournalsInput {
  before: JournalDate
}

export interface PrunePastEmptyJournalsResult {
  deletedNoteIds: readonly string[]
}

export class DuplicateNoteTitleError extends Error {
  override readonly name = 'DuplicateNoteTitleError'

  constructor(readonly title: string) {
    super(`A Note named "${title}" already exists`)
  }
}

export interface GetNoteInput {
  noteId: string
}

export interface ListNotesInput {
  page?: number
  pageSize?: number
  sortBy?: NoteSortField
  sortDirection?: NoteSortDirection
  today?: JournalDate
}

export type NoteSortDirection = 'asc' | 'desc'

export type NoteSortField = 'createdAt' | 'title' | 'updatedAt'

export interface NoteSummary {
  createdAt: number
  favorite: boolean
  id: string
  journalDate?: JournalDate
  title: string
  updatedAt: number
}

export interface ListNoteActivityInput {
  limit?: number
  today?: JournalDate
}

export interface NoteFavoriteState {
  favorite: boolean
  noteId: string
}

export type SetNoteFavoriteInput = NoteFavoriteState

export interface RecordNoteOpenedInput {
  noteId: string
  topicId: string
}

export interface FavoriteNoteItem {
  favoritedAt: number
  journalDate?: JournalDate
  noteId: string
  noteTitle: string
  topicId: string
  topicTitle: string
}

export interface RecentNoteItem {
  journalDate?: JournalDate
  noteId: string
  noteTitle: string
  openedAt: number
  topicId: string
  topicTitle: string
}

export interface NotePage {
  items: readonly NoteSummary[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface AssetReferenceProjection {
  count: number
  fileName: string
}

export interface AssetStatistics {
  managedAssetCount: number
  referenceCount: number
}

export interface StoredAsset {
  byteSize: number
  createdAt: number
  fileName: string
  mimeType: string
  originalFileName: string
}

export interface RegisterAssetInput {
  byteSize: number
  createdAt?: number
  fileName: string
  mimeType: string
  originalFileName: string
}

export interface ReconcileNoteAssetReferencesInput {
  allowedMissingAssetFileNames?: readonly string[]
  expectedLatestSequence: number
  noteId: string
  references: readonly AssetReferenceProjection[]
}

export interface SaveNoteUpdatesInput {
  allowedMissingAssetFileNames?: readonly string[]
  assetReferences?: readonly AssetReferenceProjection[]
  entries?: readonly NoteEntryProjection[]
  journalHasUserContent?: boolean
  learningCards?: readonly LearningTopicCardProjection[]
  noteId: string
  title?: string
  topics: readonly TopicContentProjection[]
  updates: readonly Uint8Array[]
}

export interface CheckpointNoteInput {
  noteId: string
  snapshot: Uint8Array
  throughSequence: number
}

export interface NoteWriteReceipt {
  acceptedUpdateHashes: readonly string[]
  latestSequence: number
  updatedAt: number
}

export interface GetTopicBlockInput {
  blockId: string
  noteId: string
  topicId: string
}

export type TopicBlockSearchMode = 'hybrid' | 'lexical' | 'semantic'

export interface SearchTopicBlocksInput {
  limit?: number
  mode?: TopicBlockSearchMode
  noteId?: string
  query: string
  today?: JournalDate
}

export interface SearchNotesInput {
  limit?: number
  query: string
  today?: JournalDate
}

export interface OpenMostRecentNoteInput {
  today?: JournalDate
}

export type NoteSearchMatch = 'content' | 'node-start' | 'semantic' | 'title'

export interface NoteTitleSearchHit {
  journalDate?: JournalDate
  kind: 'note'
  match: 'title'
  noteId: string
  noteTitle: string
  preview: string
  rank: number
}

export interface TopicSearchHit {
  blockId: string | null
  journalDate?: JournalDate
  kind: 'topic'
  match: NoteSearchMatch
  noteId: string
  noteTitle: string
  preview: string
  rank: number
  topicId: string
  topicTitle: string
}

export type NoteSearchHit = NoteTitleSearchHit | TopicSearchHit

export interface IndexPendingEmbeddingsInput {
  limit?: number
  noteId?: string
}

export interface IndexPendingEmbeddingsResult {
  hasPending: boolean
  indexed: number
}

export interface StoredTopicBlock extends TopicBlockProjection {
  contentHash: string
  noteId: string
  topicId: string
}

export interface TopicBlockSearchHit extends StoredTopicBlock {
  preview: string
  rank: number
}

export interface EditorAssetStorage {
  claimUnreferenced: (input: { fileName: string, unreferencedBefore: number }) => Promise<StoredAsset | null>
  completeDeletion: (input: { fileName: string }) => Promise<void>
  getStatistics: () => Promise<AssetStatistics>
  list: () => Promise<readonly StoredAsset[]>
  listClaimed: () => Promise<readonly StoredAsset[]>
  listUnreferenced: (input: { unreferencedBefore: number }) => Promise<readonly StoredAsset[]>
  register: (input: RegisterAssetInput) => Promise<StoredAsset>
  releaseClaim: (input: { fileName: string }) => Promise<void>
}

export interface EditorBookTopicStorage {
  listByFile: (file: BookFileFingerprint) => Promise<readonly BookTopicContext[]>
  listByReadingId: (readingId: string) => Promise<readonly BookTopicContext[]>
}

export interface EditorJournalStorage {
  getMetadata: (input: GetNoteInput) => Promise<JournalMetadata | null>
  getOrCreate: (input: GetOrCreateJournalInput) => Promise<StoredJournal>
  listDates: (input: ListJournalDatesInput) => Promise<readonly JournalDate[]>
  listPast: (input: ListPastJournalsInput) => Promise<StoredJournalPage>
  prunePastEmpty: (input: PrunePastEmptyJournalsInput) => Promise<PrunePastEmptyJournalsResult>
}

export interface EditorNoteStorage {
  checkpointNote: (input: CheckpointNoteInput) => Promise<NoteWriteReceipt>
  createInitializedNote: (input: CreateInitializedNoteInput) => Promise<StoredNote>
  createNote: (input?: CreateNoteInput) => Promise<StoredNote>
  getNote: (input: GetNoteInput) => Promise<StoredNote>
  getNoteFavorite: (input: GetNoteInput) => Promise<NoteFavoriteState>
  listFavoriteNotes: (input?: ListNoteActivityInput) => Promise<readonly FavoriteNoteItem[]>
  listNoteIds: () => Promise<readonly string[]>
  listNotes: (input?: ListNotesInput) => Promise<NotePage>
  listRecentNotes: (input?: ListNoteActivityInput) => Promise<readonly RecentNoteItem[]>
  openMostRecentNote: (input?: OpenMostRecentNoteInput) => Promise<StoredNote>
  reconcileNoteAssetReferences: (input: ReconcileNoteAssetReferencesInput) => Promise<boolean>
  recordNoteOpened: (input: RecordNoteOpenedInput) => Promise<void>
  saveNoteUpdates: (input: SaveNoteUpdatesInput) => Promise<NoteWriteReceipt>
  setNoteFavorite: (input: SetNoteFavoriteInput) => Promise<NoteFavoriteState>
}

export interface EditorSearchStorage {
  getTopicBlock: (input: GetTopicBlockInput) => Promise<StoredTopicBlock | null>
  indexPendingEmbeddings: (input?: IndexPendingEmbeddingsInput) => Promise<IndexPendingEmbeddingsResult>
  searchNotes: (input: SearchNotesInput) => Promise<readonly NoteSearchHit[]>
  searchTopicBlocks: (input: SearchTopicBlocksInput) => Promise<readonly TopicBlockSearchHit[]>
}

/**
 * Owns the shared database operation lifecycle and exposes the storage package's
 * deep modules as named facets. Callers choose a domain facet instead of learning
 * a flat forwarding interface; concrete repository implementations remain private.
 */
export interface EditorStorage {
  readonly assets: EditorAssetStorage
  readonly bookTopics: EditorBookTopicStorage
  close: () => Promise<void>
  readonly journals: EditorJournalStorage
  readonly learning: LearningStorage
  readonly notes: EditorNoteStorage
  readonly search: EditorSearchStorage
  /** @deprecated Use the domain facets above. */
  checkpointNote: (input: CheckpointNoteInput) => Promise<NoteWriteReceipt>
  /** @deprecated Use `assets.claimUnreferenced`. */
  claimUnreferencedAsset: (input: { fileName: string, unreferencedBefore: number }) => Promise<StoredAsset | null>
  /** @deprecated Use `assets.completeDeletion`. */
  completeAssetDeletion: (input: { fileName: string }) => Promise<void>
  /** @deprecated Use `notes.createInitializedNote`. */
  createInitializedNote: (input: CreateInitializedNoteInput) => Promise<StoredNote>
  /** @deprecated Use `notes.createNote`. */
  createNote: (input?: CreateNoteInput) => Promise<StoredNote>
  /** @deprecated Use `assets.getStatistics`. */
  getAssetStatistics: () => Promise<AssetStatistics>
  /** @deprecated Use `notes.getNote`. */
  getNote: (input: GetNoteInput) => Promise<StoredNote>
  /** @deprecated Use `notes.getNoteFavorite`. */
  getNoteFavorite: (input: GetNoteInput) => Promise<NoteFavoriteState>
  /** @deprecated Use `journals.getMetadata`. */
  getJournalMetadata: (input: GetNoteInput) => Promise<JournalMetadata | null>
  /** @deprecated Use `journals.getOrCreate`. */
  getOrCreateJournal: (input: GetOrCreateJournalInput) => Promise<StoredJournal>
  /** @deprecated Use `search.getTopicBlock`. */
  getTopicBlock: (input: GetTopicBlockInput) => Promise<StoredTopicBlock | null>
  /** @deprecated Use `search.indexPendingEmbeddings`. */
  indexPendingEmbeddings: (input?: IndexPendingEmbeddingsInput) => Promise<number>
  /** @deprecated Use `notes.listFavoriteNotes`. */
  listFavoriteNotes: (input?: ListNoteActivityInput) => Promise<readonly FavoriteNoteItem[]>
  /** @deprecated Use `journals.listDates`. */
  listJournalDates: (input: ListJournalDatesInput) => Promise<readonly JournalDate[]>
  /** @deprecated Use `notes.listNoteIds`. */
  listNoteIds: () => Promise<readonly string[]>
  /** @deprecated Use `notes.listNotes`. */
  listNotes: (input?: ListNotesInput) => Promise<NotePage>
  /** @deprecated Use `journals.listPast`. */
  listPastJournals: (input: ListPastJournalsInput) => Promise<StoredJournalPage>
  /** @deprecated Use `assets.list`. */
  listAssets: () => Promise<readonly StoredAsset[]>
  /** @deprecated Use `bookTopics.listByFile`. */
  listBookTopicContextsByFile: (file: BookFileFingerprint) => Promise<readonly BookTopicContext[]>
  /** @deprecated Use `bookTopics.listByReadingId`. */
  listBookTopicContextsByReadingId: (readingId: string) => Promise<readonly BookTopicContext[]>
  /** @deprecated Use `assets.listClaimed`. */
  listClaimedAssets: () => Promise<readonly StoredAsset[]>
  /** @deprecated Use `notes.listRecentNotes`. */
  listRecentNotes: (input?: ListNoteActivityInput) => Promise<readonly RecentNoteItem[]>
  /** @deprecated Use `assets.listUnreferenced`. */
  listUnreferencedAssets: (input: { unreferencedBefore: number }) => Promise<readonly StoredAsset[]>
  /** @deprecated Use `notes.openMostRecentNote`. */
  openMostRecentNote: (input?: OpenMostRecentNoteInput) => Promise<StoredNote>
  /** @deprecated Use `journals.prunePastEmpty`. */
  prunePastEmptyJournals: (input: PrunePastEmptyJournalsInput) => Promise<PrunePastEmptyJournalsResult>
  /** @deprecated Use `notes.reconcileNoteAssetReferences`. */
  reconcileNoteAssetReferences: (input: ReconcileNoteAssetReferencesInput) => Promise<boolean>
  /** @deprecated Use `notes.recordNoteOpened`. */
  recordNoteOpened: (input: RecordNoteOpenedInput) => Promise<void>
  /** @deprecated Use `assets.register`. */
  registerAsset: (input: RegisterAssetInput) => Promise<StoredAsset>
  /** @deprecated Use `assets.releaseClaim`. */
  releaseAssetClaim: (input: { fileName: string }) => Promise<void>
  /** @deprecated Use `notes.saveNoteUpdates`. */
  saveNoteUpdates: (input: SaveNoteUpdatesInput) => Promise<NoteWriteReceipt>
  /** @deprecated Use `search.searchNotes`. */
  searchNotes: (input: SearchNotesInput) => Promise<readonly NoteSearchHit[]>
  /** @deprecated Use `search.searchTopicBlocks`. */
  searchTopicBlocks: (input: SearchTopicBlocksInput) => Promise<readonly TopicBlockSearchHit[]>
  /** @deprecated Use `notes.setNoteFavorite`. */
  setNoteFavorite: (input: SetNoteFavoriteInput) => Promise<NoteFavoriteState>
}

export interface CreateEditorStorageOptions {
  database: EditorStorageDatabase
  embeddingModel: EmbeddingModel
  learningConfiguration?: () => LearningPracticeConfiguration
}

export interface SqliteEditorStorageOptions {
  database: EditorStorageDatabase
  /**
   * Whether EditorStorage is responsible for closing the supplied database.
   * This must be explicit so a composition root cannot accidentally change
   * shutdown ownership by omitting an option. Shared roots should use
   * `borrowed` and close the database after every database-backed owner shuts
   * down.
   */
  databaseOwnership: 'borrowed' | 'owned'
  /**
   * Shared database admission supplied by a composition root. When present,
   * EditorStorage borrows this supervisor and never closes it; the composition
   * root must close it after every storage using the same database has drained.
   */
  operationSupervisor?: OperationSupervisor
  embeddingModel: EmbeddingModel
  learningConfiguration?: () => LearningPracticeConfiguration
}
