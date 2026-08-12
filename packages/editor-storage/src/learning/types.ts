import type {
  FsrsOptimizerConfiguration,
  LearningDailyGoalMode,
  LearningPhase,
  LearningQueueMode,
  LearningState,
  ReviewRating,
} from '@memorilo/srs'

export type {
  FsrsOptimizerConfiguration,
  LearningDailyGoalMode,
  LearningPhase,
  LearningPracticeConfiguration,
  LearningQueueMode,
  LearningQueuePolicy,
  LearningState,
  ReviewRating,
} from '@memorilo/srs'

export type LearningTargetKind = 'item' | 'whole'
export type LearningCardKind = 'basic' | 'cloze' | 'list' | 'set'
export type LearningCardDirection = 'backward' | 'forward'

export interface FsrsOptimizer {
  configuration: FsrsOptimizerConfiguration
  createdAt: number
  id: string
  isGlobal: boolean
  name: string
  revisionId: string
  status: 'active' | 'archived'
  updatedAt: number
}

export interface LearningCardProjection {
  cardId: string
  direction: LearningCardDirection
  itemBlockIds: readonly string[]
  kind: LearningCardKind
  sourceBlockId: string
}

export interface LearningTopicCardProjection {
  cards: readonly LearningCardProjection[]
  topicOrder: number
  topicId: string
}

export interface ReconcileLearningCardsInput extends LearningTopicCardProjection {
  noteId: string
}

export interface LearningTarget {
  active: boolean
  cardId: string
  itemBlockId: string | null
  kind: LearningTargetKind
  partialActive: boolean
  targetId: string
}

interface DirectLearningReview {
  eventId?: string
  expectedOptimizerRevisionId?: never
  expectedStateHash?: never
  expectedWinningEventId?: never
  reviewedAt?: number
  targetId: string
}

export interface LearningReviewPreparationToken {
  eventId: string
  expectedOptimizerRevisionId: string
  expectedStateHash: string
  expectedWinningEventId: string | null
  reviewedAt: number
  targetId: string
}

interface LearningRatingSelection {
  rating: ReviewRating
  responseMilliseconds?: number
}

export type RateLearningTargetInput = LearningRatingSelection & (
  DirectLearningReview | LearningReviewPreparationToken
)

export interface PreparedLearningRating extends LearningReviewPreparationToken, LearningRatingSelection {}

export interface RateMultiLineCardInput {
  cardId: string
  itemRatings: readonly PreparedLearningRating[]
  mainPreparation: LearningReviewPreparationToken
  responseMilliseconds?: number
  setRating?: ReviewRating
}

export interface PrepareLearningReviewInput {
  reviewedAt?: number
  targetId: string
}

export interface LearningRatingOutcome {
  intervalMilliseconds: number
  state: LearningState
}

export interface PreparedLearningReview extends LearningReviewPreparationToken {
  outcomes: Record<ReviewRating, LearningRatingOutcome>
}

export interface ReviewResult {
  eventId: string
  state: LearningState
}

export interface MultiLineReviewResult {
  itemResults: readonly ReviewResult[]
  mainResult: ReviewResult
}

export interface ResetLearningTargetInput {
  eventId?: string
  resetAt?: number
  targetId: string
}

export interface UndoLearningReviewInput {
  eventId?: string
  expectedReviewEventId?: string
  targetId: string
  undoneAt?: number
}

export interface UndoLearningReviewCommand {
  eventId: string
  expectedReviewEventId: string
  targetId: string
}

export interface UndoLearningReviewsInput {
  reviews: readonly UndoLearningReviewCommand[]
  undoneAt?: number
}

export interface CreateFsrsOptimizerInput {
  configuration?: FsrsOptimizerConfiguration
  id?: string
  name: string
}

export interface SaveFsrsOptimizerInput {
  configuration: FsrsOptimizerConfiguration
  name: string
  optimizerId: string
  rescheduleNow?: boolean
}

export interface OptimizeFsrsOptimizerInput {
  optimizerId: string
  rescheduleNow?: boolean
  timeoutMilliseconds?: number
}

export interface AssignNoteOptimizerInput {
  noteId: string
  optimizerId: string
}

export interface LearningQueueItem {
  cardId: string
  dueAt: number
  noteId: string
  phase: LearningPhase
  presentation: 'full' | 'partial'
  sourceBlockId: string
  targetIds: readonly string[]
  topicId: string
}

export interface LearningDailyProgress {
  completedCards: number
  dailyGoalCards: number
  dailyGoalMode: LearningDailyGoalMode
  dueReviewCards: number
  introducedNewCards: number
  newCardsPerDay: number
  remainingNewCards: number
  studyDayEndsAt: number
  studyDayStartedAt: number
}

export interface LearningNoteSummary {
  cardCount: number
  noteId: string
  noteTitle: string
  optimizer: {
    id: string
    isGlobal: boolean
    name: string
  }
  topicCount: number
  updatedAt: number
}

export interface ListLearningQueueInput {
  limit?: number
  mode?: LearningQueueMode
  noteId?: string
  now?: number
  topicId?: string
}

export interface LearningMaintenanceEstimate {
  archivedOptimizers: number
  inactiveCards: number
  reviewEvents: number
  targets: number
}

export interface LearningMaintenanceResult extends LearningMaintenanceEstimate {
  vacuumed: boolean
}

export interface LearningSyncChange {
  createdAt: number
  entityId: string
  entityKind: 'assignment' | 'card' | 'optimizer' | 'review-event' | 'tombstone'
  mutationId: string
  operation: 'delete' | 'upsert'
  payload: unknown
}

export interface AcknowledgeLearningSyncInput {
  mutationIds: readonly string[]
  serverSequence: number
}

export interface LearningCardStorage {
  listNotesWithCards: () => Promise<readonly LearningNoteSummary[]>
  listNoteTopicIds: (noteId: string) => Promise<readonly string[]>
  listTargets: (cardId: string) => Promise<readonly LearningTarget[]>
  reconcileTopicCards: (input: ReconcileLearningCardsInput) => Promise<void>
}

export interface LearningMaintenanceStorage {
  getEstimate: () => Promise<LearningMaintenanceEstimate>
  maintain: () => Promise<LearningMaintenanceResult>
}

export interface LearningOptimizerStorage {
  archive: (optimizerId: string) => Promise<void>
  assignToNote: (input: AssignNoteOptimizerInput) => Promise<void>
  create: (input: CreateFsrsOptimizerInput) => Promise<FsrsOptimizer>
  get: (optimizerId: string) => Promise<FsrsOptimizer>
  getForNote: (noteId: string) => Promise<FsrsOptimizer>
  getNoteCount: (optimizerId: string) => Promise<number>
  list: () => Promise<readonly FsrsOptimizer[]>
  optimize: (input: OptimizeFsrsOptimizerInput) => Promise<FsrsOptimizer>
  resetDefaults: (optimizerId: string, rescheduleNow?: boolean) => Promise<FsrsOptimizer>
  save: (input: SaveFsrsOptimizerInput) => Promise<FsrsOptimizer>
}

export interface LearningQueueStorage {
  getDailyProgress: (now?: number) => Promise<LearningDailyProgress>
  list: (input?: ListLearningQueueInput) => Promise<readonly LearningQueueItem[]>
}

export interface LearningReviewStorage {
  getState: (targetId: string) => Promise<LearningState>
  prepare: (input: PrepareLearningReviewInput) => Promise<PreparedLearningReview>
  rateMultiLineCard: (input: RateMultiLineCardInput) => Promise<MultiLineReviewResult>
  rateTarget: (input: RateLearningTargetInput) => Promise<ReviewResult>
  resetTarget: (input: ResetLearningTargetInput) => Promise<LearningState>
  undoLast: (input: UndoLearningReviewInput) => Promise<LearningState>
  undoMany: (input: UndoLearningReviewsInput) => Promise<readonly LearningState[]>
}

export interface LearningSyncStorage {
  acknowledge: (input: AcknowledgeLearningSyncInput) => Promise<void>
  listPending: (limit?: number) => Promise<readonly LearningSyncChange[]>
}

export interface LearningStorage {
  readonly cards: LearningCardStorage
  readonly maintenance: LearningMaintenanceStorage
  readonly optimizers: LearningOptimizerStorage
  readonly queue: LearningQueueStorage
  readonly reviews: LearningReviewStorage
  readonly sync: LearningSyncStorage
}
