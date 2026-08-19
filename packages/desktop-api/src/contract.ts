import type {
  AnkiDeck,
  AnkiReviewAnswerInput,
  AnkiReviewCardInput,
  AnkiReviewerCard,
} from '@memorilo/anki-connect/model'
import type { DesktopConfiguration } from '@memorilo/desktop-config/contract'
import type {
  LearningQueueItem,
  LearningStorage,
  ListLearningQueueInput,
  ListTodoTasksInput,
  TodoCalendarEvent,
  TodoCalendarSubscription,
  TodoReminder,
  TodoRepeatRule,
  TodoTask,
  TodoTaskPage,
  TodoTaskStatus,
} from '@memorilo/editor-storage'
import type { ReviewCardProjection } from '@memorilo/editor/card'
import type { WhiteboardLibraryItem } from '@memorilo/editor/note'
import type { BookFileBinding, BookReadingState } from '@memorilo/reading-model'
import type {
  AddShelfSourceInput,
  BrowseShelfInput,
  OpenShelfReadingInput,
  PreparedShelfReading,
  PrepareShelfReadingInput,
  ShelfAssetInput,
  ShelfAssetResult,
  ShelfBrowseResult,
  ShelfPublicationDetails,
  ShelfPublicationDetailsInput,
  ShelfReadingDocument,
  ShelfReadingRangeInput,
  ShelfSource,
  UpdateShelfSourceInput,
} from '@memorilo/shelf'

export type { DesktopConfiguration } from '@memorilo/desktop-config/contract'
export type {
  AddShelfSourceInput,
  BrowseShelfInput,
  OpenShelfReadingInput,
  PreparedShelfReading,
  PrepareShelfReadingInput,
  ShelfAssetInput,
  ShelfAssetResult,
  ShelfBrowseResult,
  ShelfPublicationDetails,
  ShelfPublicationDetailsInput,
  ShelfReadingDocument,
  ShelfReadingRangeInput,
  ShelfSource,
  UpdateShelfSourceInput,
} from '@memorilo/shelf'

export interface CaptureDesktopReaderRegionInput {
  height: number
  width: number
  x: number
  y: number
}

export interface SaveDesktopImageInput {
  data: Uint8Array
  fileName: string
  mimeType: string
}

export interface SaveDesktopImageResult {
  src: string
}

export interface ImportDesktopNetworkImageInput {
  source: string
}

export interface DesktopAssetCandidate {
  byteSize: number
  fileName: string
  originalFileName: string
}

export interface DesktopMissingAsset {
  fileName: string
  originalFileName: string
  referenceCount: number
}

export interface DesktopAssetCheckResult {
  candidates: readonly DesktopAssetCandidate[]
  managedAssetCount: number
  missingAssets: readonly DesktopMissingAsset[]
  referencedAssetCount: number
}

export interface DesktopExportDatabaseResult {
  path: string
}

export type DesktopRestoreDatabaseResult
  = | { status: 'cancelled' }
    | { status: 'restarting' }

export interface ReclaimDesktopAssetsInput {
  fileNames: readonly string[]
  mode: 'permanent' | 'trash'
}

export interface ReclaimDesktopAssetsResult {
  cancelled: boolean
  failedFileNames: readonly string[]
  reclaimedFileNames: readonly string[]
}

export interface DesktopReviewTarget {
  itemBlockId: string | null
  targetId: string
}

export interface DesktopReviewItem {
  card: ReviewCardProjection
  mainTargetId: string
  noteTitle: string
  queue: LearningQueueItem
  targets: readonly DesktopReviewTarget[]
  topicTitle: string
  updatedAt: number
}

export type GetNextDesktopReviewItemInput = Omit<ListLearningQueueInput, 'limit' | 'mode'>

export type DesktopTodoTaskStatus = TodoTaskStatus
export type DesktopTodoTask = TodoTask
export type DesktopTodoTaskPage = TodoTaskPage
export type DesktopTodoReminder = TodoReminder
export type DesktopTodoRepeatRule = TodoRepeatRule
export type DesktopTodoCalendarEvent = TodoCalendarEvent
export interface DesktopTodoCalendarSubscription extends TodoCalendarSubscription {
  builtIn: boolean
}
export type ListDesktopTodoTasksInput = ListTodoTasksInput

export interface UpdateDesktopTodoTaskInput {
  allDay?: boolean
  blockId: string
  dueDate?: string | null
  dueTime?: string | null
  endAt?: string | null
  nextDueDate?: string | null
  noteId: string
  onlyThis?: boolean
  reminderMinutes?: number | null
  reminders?: readonly DesktopTodoReminder[] | null
  repeatRule?: DesktopTodoRepeatRule | null
  status?: DesktopTodoTaskStatus
  startAt?: string | null
  text?: string
  topicId: string
}

export interface SubscribeDesktopTodoCalendarInput {
  title: string
  url: string
}

export interface RestoreDesktopReviewItemInput {
  cardId: string
  noteId: string
  presentation: LearningQueueItem['presentation']
  targetId: string
  topicId: string
}

export type DesktopAnkiDeck = AnkiDeck
export type DesktopAnkiReviewerCard = AnkiReviewerCard

interface DesktopLearningStorageApi {
  archiveOptimizer: LearningStorage['optimizers']['archive']
  assignNoteOptimizer: LearningStorage['optimizers']['assignToNote']
  createOptimizer: LearningStorage['optimizers']['create']
  getActivitySummary: LearningStorage['queue']['getActivitySummary']
  getDailyProgress: LearningStorage['queue']['getDailyProgress']
  getLearningState: LearningStorage['reviews']['getState']
  getMaintenanceEstimate: LearningStorage['maintenance']['getEstimate']
  getNoteOptimizer: LearningStorage['optimizers']['getForNote']
  getOptimizer: LearningStorage['optimizers']['get']
  getOptimizerNoteCount: LearningStorage['optimizers']['getNoteCount']
  listNotesWithCards: LearningStorage['cards']['listNotesWithCards']
  listOptimizers: LearningStorage['optimizers']['list']
  listQueue: LearningStorage['queue']['list']
  listTargets: LearningStorage['cards']['listTargets']
  maintainDatabase: LearningStorage['maintenance']['maintain']
  optimizeOptimizer: LearningStorage['optimizers']['optimize']
  prepareReview: LearningStorage['reviews']['prepare']
  rateMultiLineCard: LearningStorage['reviews']['rateMultiLineCard']
  rateTarget: LearningStorage['reviews']['rateTarget']
  resetOptimizerDefaults: LearningStorage['optimizers']['resetDefaults']
  resetTarget: LearningStorage['reviews']['resetTarget']
  undoLastReview: LearningStorage['reviews']['undoLast']
  undoReviews: LearningStorage['reviews']['undoMany']
  saveOptimizer: LearningStorage['optimizers']['save']
}

export interface DesktopLearningApi extends DesktopLearningStorageApi {
  answerAnkiReviewCard: (input: AnkiReviewAnswerInput) => Promise<DesktopAnkiReviewerCard | null>
  endAnkiReview: () => Promise<void>
  getCurrentAnkiReviewCard: () => Promise<DesktopAnkiReviewerCard | null>
  getNextItem: (input?: GetNextDesktopReviewItemInput) => Promise<DesktopReviewItem | null>
  getNextNewItem: (input?: GetNextDesktopReviewItemInput) => Promise<DesktopReviewItem | null>
  getNextReviewItem: (input?: GetNextDesktopReviewItemInput) => Promise<DesktopReviewItem | null>
  restoreReviewItem: (input: RestoreDesktopReviewItemInput) => Promise<DesktopReviewItem | null>
  listAnkiDecks: () => Promise<readonly DesktopAnkiDeck[]>
  playAnkiReviewAudio: (input: AnkiReviewCardInput) => Promise<void>
  retrieveAnkiMediaFile: (filename: string) => Promise<string | null>
  showAnkiReviewAnswer: (input: AnkiReviewCardInput) => Promise<DesktopAnkiReviewerCard>
  startAnkiDeckReview: (deck: DesktopAnkiDeck) => Promise<DesktopAnkiReviewerCard | null>
}

export interface DesktopTopicBlock {
  attributes: Readonly<Record<string, unknown>>
  id: string
  kind: string
  ordinal: number
  parentId: string | null
  text: string
}

export type JournalDate = string

export interface DesktopNoteBase {
  createdAt: number
  favorite: boolean
  id: string
  snapshot: Uint8Array
  title: string
  updatedAt: number
}

export interface DesktopRegularNote extends DesktopNoteBase {
  kind: 'regular'
}

export interface DesktopJournalNote extends DesktopNoteBase {
  journalDate: JournalDate
  kind: 'journal'
  topicId: string
}

export type DesktopNote = DesktopJournalNote | DesktopRegularNote

export interface DesktopBookTopicContextSummary {
  book: BookFileBinding
  noteId: string
  noteTitle: string
  topicId: string
  topicTitle: string
}

export interface DesktopBookTopicReadingContext {
  book: BookFileBinding
  note: DesktopNote
  readingState: BookReadingState
  topicId: string
  topicTitle: string
}

export type CreateDesktopBookContextResult
  = | {
    context: DesktopBookTopicReadingContext
    sessionId: string
    status: 'created'
  }
  | { status: 'duplicate-title' }

export interface OpenDesktopBookContextResult {
  context: DesktopBookTopicReadingContext
  sessionId: string
}

export interface CreateDesktopNoteInput {
  initialHeading?: string
  title?: string
}

export interface GetDesktopNoteInput {
  noteId: string
}

export interface ListDesktopNotesInput {
  page?: number
  pageSize?: number
  sortBy?: DesktopNoteSortField
  sortDirection?: DesktopNoteSortDirection
}

export type DesktopNoteSortDirection = 'asc' | 'desc'
export type DesktopNoteSortField = 'createdAt' | 'title' | 'updatedAt'

export interface RenameDesktopNoteInput {
  noteId: string
  title: string
}

export interface DesktopNoteSummaryBase {
  createdAt: number
  favorite: boolean
  id: string
  title: string
  updatedAt: number
}

export interface DesktopRegularNoteSummary extends DesktopNoteSummaryBase {
  kind: 'regular'
}

export interface DesktopJournalNoteSummary extends DesktopNoteSummaryBase {
  journalDate: JournalDate
  kind: 'journal'
}

export type DesktopNoteSummary = DesktopJournalNoteSummary | DesktopRegularNoteSummary

export interface OpenDesktopJournalInput {
  journalDate?: JournalDate
}

export interface ListDesktopPastJournalsInput {
  before?: JournalDate
  limit?: number
}

export interface ListDesktopJournalDatesInput {
  from: JournalDate
  through: JournalDate
}

export interface DesktopJournalSummary {
  createdAt: number
  journalDate: JournalDate
  kind: 'journal'
  noteId: string
  title: string
  topicId: string
  updatedAt: number
}

export interface DesktopJournalPage {
  items: readonly DesktopJournalSummary[]
  nextCursor: JournalDate | null
}

export interface PruneDesktopPastEmptyJournalsResult {
  deletedNoteIds: readonly string[]
}

interface DesktopFavoriteNoteItemBase {
  favoritedAt: number
  noteId: string
  noteTitle: string
  topicId: string
  topicTitle: string
}

export type DesktopFavoriteNoteItem = DesktopFavoriteNoteItemBase & (
  | { kind: 'regular' }
  | { journalDate: JournalDate, kind: 'journal' }
)

interface DesktopRecentNoteItemBase {
  noteId: string
  noteTitle: string
  openedAt: number
  topicId: string
  topicTitle: string
}

export type DesktopRecentNoteItem = DesktopRecentNoteItemBase & (
  | { kind: 'regular' }
  | { journalDate: JournalDate, kind: 'journal' }
)

export interface SetDesktopNoteFavoriteInput {
  favorite: boolean
  noteId: string
}

export type DesktopNoteFavoriteState = SetDesktopNoteFavoriteInput

export interface RecordDesktopNoteOpenedInput {
  noteId: string
  topicId: string
}

export type RenameDesktopNoteResult
  = | { note: DesktopNoteSummary, status: 'renamed' }
    | { status: 'duplicate-title' }
    | { journalDate: JournalDate, status: 'journal-title-immutable' }

export interface DesktopNotePage {
  items: readonly DesktopNoteSummary[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface DesktopColumnVisibilityMenuItem {
  canToggle: boolean
  id: string
  label: string
  visible: boolean
}

export interface ShowDesktopColumnVisibilityMenuInput {
  anchor: { x: number, y: number }
  columns: readonly DesktopColumnVisibilityMenuItem[]
}

export interface DesktopColumnVisibilityMenuSelection {
  columnId: string
}

export interface SaveDesktopNoteUpdatesInput {
  noteId: string
  updates: readonly Uint8Array[]
}

export interface DesktopNoteWriteReceipt {
  updatedAt: number
}

export interface DesktopNoteExternalUpdate {
  noteId: string
  update: Uint8Array
  updatedAt: number
}

export interface DesktopWhiteboardLibraryData {
  libraryItems: readonly WhiteboardLibraryItem[]
}

export interface DesktopStoredTopicBlock extends DesktopTopicBlock {
  contentHash: string
  noteId: string
  topicId: string
}

export interface DesktopTopicBlockSearchHit extends DesktopStoredTopicBlock {
  preview: string
  rank: number
}

export type DesktopTopicBlockSearchMode = 'hybrid' | 'lexical' | 'semantic'
export type DesktopNoteSearchMatch = 'content' | 'node-start' | 'semantic' | 'title'

type DesktopNoteSearchIdentity
  = | { noteKind: 'regular' }
    | { journalDate: JournalDate, noteKind: 'journal' }

interface DesktopNoteTitleSearchHitBase {
  kind: 'note'
  match: 'title'
  noteId: string
  noteTitle: string
  preview: string
  rank: number
}

export type DesktopNoteTitleSearchHit = DesktopNoteTitleSearchHitBase & DesktopNoteSearchIdentity

interface DesktopTopicSearchHitBase {
  blockId: string | null
  kind: 'topic'
  match: DesktopNoteSearchMatch
  noteId: string
  noteTitle: string
  preview: string
  rank: number
  topicId: string
  topicTitle: string
}

export type DesktopTopicSearchHit = DesktopTopicSearchHitBase & DesktopNoteSearchIdentity

export type DesktopNoteSearchHit = DesktopNoteTitleSearchHit | DesktopTopicSearchHit

export interface DesktopApi {
  addShelfSource: (input: AddShelfSourceInput) => Promise<ShelfSource>
  checkAssets: () => Promise<DesktopAssetCheckResult>
  captureReaderRegion: (input: CaptureDesktopReaderRegionInput) => Promise<Uint8Array>
  closeBookReadingSession: (sessionId: string) => Promise<boolean>
  createBookContext: (input: { noteTitle: string, readingId: string, topicTitle: string }) => Promise<CreateDesktopBookContextResult>
  createNote: (input?: CreateDesktopNoteInput) => Promise<DesktopNote>
  deleteShelfReading: (readingId: string) => Promise<boolean>
  exportDatabase: () => Promise<DesktopExportDatabaseResult | { status: 'cancelled' }>
  getCachedShelfView: (input: BrowseShelfInput) => Promise<ShelfBrowseResult>
  getConfiguration: () => Promise<DesktopConfiguration>
  getNote: (input: GetDesktopNoteInput) => Promise<DesktopNote>
  getRuntimeInfo: () => Promise<RuntimeInfo>
  getShelfAsset: (input: ShelfAssetInput) => Promise<ShelfAssetResult>
  getShelfPublicationDetails: (input: ShelfPublicationDetailsInput) => Promise<ShelfPublicationDetails>
  getTopicBlock: (input: { blockId: string, noteId: string, topicId: string }) => Promise<DesktopStoredTopicBlock | null>
  importNetworkImage: (input: ImportDesktopNetworkImageInput) => Promise<SaveDesktopImageResult>
  isBookReadingAvailable: (readingId: string) => Promise<boolean>
  listBookContexts: (readingId: string) => Promise<readonly DesktopBookTopicContextSummary[]>
  listFavoriteNotes: (input?: { limit?: number }) => Promise<readonly DesktopFavoriteNoteItem[]>
  listJournalDates: (input: ListDesktopJournalDatesInput) => Promise<readonly JournalDate[]>
  listNotes: (input?: ListDesktopNotesInput) => Promise<DesktopNotePage>
  listPastJournals: (input?: ListDesktopPastJournalsInput) => Promise<DesktopJournalPage>
  listRecentNotes: (input?: { limit?: number }) => Promise<readonly DesktopRecentNoteItem[]>
  listTodoTasks: (input?: ListDesktopTodoTasksInput) => Promise<DesktopTodoTaskPage>
  listTodoCalendarEvents: (input: { from: string, through: string }) => Promise<readonly DesktopTodoCalendarEvent[]>
  listTodoCalendarSubscriptions: () => Promise<readonly DesktopTodoCalendarSubscription[]>
  refreshTodoCalendar: (id: string) => Promise<DesktopTodoCalendarSubscription>
  removeTodoCalendar: (id: string) => Promise<void>
  subscribeTodoCalendar: (input: SubscribeDesktopTodoCalendarInput) => Promise<DesktopTodoCalendarSubscription>
  updateTodoTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  learning: DesktopLearningApi
  listShelfSources: () => Promise<readonly ShelfSource[]>
  openJournal: (input?: OpenDesktopJournalInput) => Promise<DesktopJournalNote>
  openMostRecentNote: () => Promise<DesktopNote>
  openShelfReading: (input: OpenShelfReadingInput) => Promise<ShelfReadingDocument>
  prepareShelfReading: (input: PrepareShelfReadingInput) => Promise<PreparedShelfReading>
  prunePastEmptyJournals: () => Promise<PruneDesktopPastEmptyJournalsResult>
  readShelfReadingRange: (input: ShelfReadingRangeInput) => Promise<Uint8Array>
  reclaimAssets: (input: ReclaimDesktopAssetsInput) => Promise<ReclaimDesktopAssetsResult>
  rebindBookContext: (input: { noteId: string, readingId: string, sessionId?: string, topicId: string }) => Promise<OpenDesktopBookContextResult>
  recordNoteOpened: (input: RecordDesktopNoteOpenedInput) => Promise<void>
  refreshShelfView: (input: BrowseShelfInput) => Promise<ShelfBrowseResult>
  removeShelfSource: (sourceId: string) => Promise<void>
  renameNote: (input: RenameDesktopNoteInput) => Promise<RenameDesktopNoteResult>
  restoreDatabase: () => Promise<DesktopRestoreDatabaseResult>
  saveImage: (input: SaveDesktopImageInput) => Promise<SaveDesktopImageResult>
  saveNoteUpdates: (input: SaveDesktopNoteUpdatesInput) => Promise<DesktopNoteWriteReceipt>
  searchNotes: (input: { limit?: number, query: string }) => Promise<readonly DesktopNoteSearchHit[]>
  searchTopicBlocks: (input: { limit?: number, mode?: DesktopTopicBlockSearchMode, noteId?: string, query: string }) => Promise<readonly DesktopTopicBlockSearchHit[]>
  setConfiguration: (configuration: DesktopConfiguration) => Promise<DesktopConfiguration>
  setConfigurationValue: (path: string, value: unknown) => Promise<DesktopConfiguration>
  setNoteFavorite: (input: SetDesktopNoteFavoriteInput) => Promise<DesktopNoteFavoriteState>
  selectBookContext: (input: { noteId: string, readingId: string, topicId: string }) => Promise<OpenDesktopBookContextResult>
  showColumnVisibilityMenu: (input: ShowDesktopColumnVisibilityMenuInput) => Promise<DesktopColumnVisibilityMenuSelection | null>
  updateShelfSource: (input: UpdateShelfSourceInput) => Promise<ShelfSource>
}

export interface RuntimeInfo {
  platform: string
  version: string
}
