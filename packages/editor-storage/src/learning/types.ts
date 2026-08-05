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

export interface ReconcileLearningCardsInput {
  cards: readonly LearningCardProjection[]
  noteId: string
  topicOrder: number
  topicId: string
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

export interface CreateFsrsOptimizerInput {
  configuration?: FsrsOptimizerConfiguration
  id?: string
  name: string
}

export interface UpdateFsrsOptimizerInput {
  configuration: FsrsOptimizerConfiguration
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

export interface RenameFsrsOptimizerInput {
  name: string
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

export interface LearningStorage {
  acknowledgeSyncChanges: (input: AcknowledgeLearningSyncInput) => Promise<void>
  archiveOptimizer: (optimizerId: string) => Promise<void>
  assignNoteOptimizer: (input: AssignNoteOptimizerInput) => Promise<void>
  createOptimizer: (input: CreateFsrsOptimizerInput) => Promise<FsrsOptimizer>
  getDailyProgress: (now?: number) => Promise<LearningDailyProgress>
  getLearningState: (targetId: string) => Promise<LearningState>
  getMaintenanceEstimate: () => Promise<LearningMaintenanceEstimate>
  getNoteOptimizer: (noteId: string) => Promise<FsrsOptimizer>
  getOptimizer: (optimizerId: string) => Promise<FsrsOptimizer>
  getOptimizerNoteCount: (optimizerId: string) => Promise<number>
  listNotesWithCards: () => Promise<readonly LearningNoteSummary[]>
  listOptimizers: () => Promise<readonly FsrsOptimizer[]>
  listNoteTopicIds: (noteId: string) => Promise<readonly string[]>
  listPendingSyncChanges: (limit?: number) => Promise<readonly LearningSyncChange[]>
  listQueue: (input?: ListLearningQueueInput) => Promise<readonly LearningQueueItem[]>
  listTargets: (cardId: string) => Promise<readonly LearningTarget[]>
  maintainDatabase: () => Promise<LearningMaintenanceResult>
  optimizeOptimizer: (input: OptimizeFsrsOptimizerInput) => Promise<FsrsOptimizer>
  prepareReview: (input: PrepareLearningReviewInput) => Promise<PreparedLearningReview>
  rateTarget: (input: RateLearningTargetInput) => Promise<ReviewResult>
  reconcileTopicCards: (input: ReconcileLearningCardsInput) => Promise<void>
  renameOptimizer: (input: RenameFsrsOptimizerInput) => Promise<FsrsOptimizer>
  resetOptimizerDefaults: (optimizerId: string, rescheduleNow?: boolean) => Promise<FsrsOptimizer>
  resetTarget: (input: ResetLearningTargetInput) => Promise<LearningState>
  undoLastReview: (input: UndoLearningReviewInput) => Promise<LearningState>
  updateOptimizer: (input: UpdateFsrsOptimizerInput) => Promise<FsrsOptimizer>
}
