import type {
  AssignNoteOptimizerInput,
  CreateFsrsOptimizerInput,
  FsrsOptimizer,
  GetLearningActivitySummaryInput,
  LearningActivitySummary,
  LearningDailyProgress,
  LearningMaintenanceEstimate,
  LearningMaintenanceResult,
  LearningQueueItem,
  LearningState,
  LearningStorage,
  LearningTarget,
  ListLearningQueueInput,
  MultiLineReviewResult,
  OptimizeFsrsOptimizerInput,
  PreparedLearningReview,
  PrepareLearningReviewInput,
  RateLearningTargetInput,
  RateMultiLineCardInput,
  ResetLearningTargetInput,
  ReviewResult,
  SaveFsrsOptimizerInput,
  UndoLearningReviewInput,
  UndoLearningReviewsInput,
} from '@memorilo/editor-storage'
import type { Schema as EffectSchema } from 'effect'
import type {
  DesktopReviewItem,
  GetNextDesktopReviewItemInput,
  RestoreDesktopReviewItemInput,
} from '../contract'
import { Schema } from 'effect'
import {
  EmptyArgumentsSchema,
  jsonValue,
  NonNegativeIntegerSchema,
  nullable,
  optionalArgument,
  PositiveIntegerSchema,
} from './common'

const ReviewRatingSchema = Schema.Literals(['again', 'easy', 'good', 'hard'])
const LearningPhaseSchema = Schema.Literals(['learning', 'new', 'relearning', 'review'])
const LearningQueueModeSchema = Schema.Literals(['mixed', 'new', 'review'])

export const FsrsOptimizerConfigurationSchema = Schema.Struct({
  desiredRetention: Schema.Number,
  enableFuzz: Schema.Boolean,
  fsrsParameters: Schema.Array(Schema.Number),
  learningSteps: Schema.Array(Schema.String),
  maximumIntervalDays: PositiveIntegerSchema,
  relearningSteps: Schema.Array(Schema.String),
})

export const FsrsOptimizerSchema: EffectSchema.Codec<FsrsOptimizer> = Schema.Struct({
  configuration: FsrsOptimizerConfigurationSchema,
  createdAt: Schema.Number,
  id: Schema.NonEmptyString,
  isGlobal: Schema.Boolean,
  name: Schema.String,
  revisionId: Schema.NonEmptyString,
  status: Schema.Literals(['active', 'archived']),
  updatedAt: Schema.Number,
})

export const LearningStateSchema: EffectSchema.Codec<LearningState> = Schema.Struct({
  difficulty: Schema.Number,
  dueAt: Schema.Number,
  lapses: NonNegativeIntegerSchema,
  lastReviewAt: nullable(Schema.Number),
  learningSteps: NonNegativeIntegerSchema,
  optimizerRevisionId: Schema.NonEmptyString,
  phase: LearningPhaseSchema,
  reps: NonNegativeIntegerSchema,
  scheduledDays: NonNegativeIntegerSchema,
  stability: Schema.Number,
  targetId: Schema.NonEmptyString,
  winningEventId: nullable(Schema.NonEmptyString),
})

export const LearningTargetSchema: EffectSchema.Codec<LearningTarget> = Schema.Struct({
  active: Schema.Boolean,
  cardId: Schema.NonEmptyString,
  itemBlockId: nullable(Schema.NonEmptyString),
  kind: Schema.Literals(['item', 'whole']),
  partialActive: Schema.Boolean,
  targetId: Schema.NonEmptyString,
})

export const LearningQueueItemSchema: EffectSchema.Codec<LearningQueueItem> = Schema.Struct({
  cardId: Schema.NonEmptyString,
  dueAt: Schema.Number,
  noteId: Schema.NonEmptyString,
  phase: LearningPhaseSchema,
  presentation: Schema.Literals(['full', 'partial']),
  sourceBlockId: Schema.NonEmptyString,
  targetIds: Schema.Array(Schema.NonEmptyString),
  topicId: Schema.NonEmptyString,
})

const LearningDailyGoalModeSchema = Schema.Literals(['all-due', 'fixed', 'spread-week'])
export const LearningDailyProgressSchema: EffectSchema.Codec<LearningDailyProgress> = Schema.Struct({
  completedCards: NonNegativeIntegerSchema,
  dailyGoalCards: NonNegativeIntegerSchema,
  dailyGoalMode: LearningDailyGoalModeSchema,
  dueReviewCards: NonNegativeIntegerSchema,
  introducedNewCards: NonNegativeIntegerSchema,
  newCardsPerDay: NonNegativeIntegerSchema,
  remainingNewCards: NonNegativeIntegerSchema,
  studyDayEndsAt: Schema.Number,
  studyDayStartedAt: Schema.Number,
})

export const LearningActivitySummarySchema: EffectSchema.Codec<LearningActivitySummary> = Schema.Struct({
  currentStreakDays: NonNegativeIntegerSchema,
  dailyProgress: LearningDailyProgressSchema,
  days: Schema.Array(Schema.Struct({
    reviewCount: NonNegativeIntegerSchema,
    reviewedCards: NonNegativeIntegerSchema,
    studyDayStartedAt: Schema.Number,
    successfulReviewCount: NonNegativeIntegerSchema,
  })),
})

type LearningNoteSummary = Awaited<ReturnType<LearningStorage['cards']['listNotesWithCards']>>[number]

export const LearningNoteSummarySchema: EffectSchema.Codec<LearningNoteSummary> = Schema.Struct({
  cardCount: NonNegativeIntegerSchema,
  noteId: Schema.NonEmptyString,
  noteTitle: Schema.String,
  optimizer: Schema.Struct({
    id: Schema.NonEmptyString,
    isGlobal: Schema.Boolean,
    name: Schema.String,
  }),
  topicCount: NonNegativeIntegerSchema,
  updatedAt: Schema.Number,
})

export const LearningMaintenanceEstimateSchema: EffectSchema.Codec<LearningMaintenanceEstimate> = Schema.Struct({
  archivedOptimizers: NonNegativeIntegerSchema,
  inactiveCards: NonNegativeIntegerSchema,
  reviewEvents: NonNegativeIntegerSchema,
  targets: NonNegativeIntegerSchema,
})

export const LearningMaintenanceResultSchema: EffectSchema.Codec<LearningMaintenanceResult> = Schema.Struct({
  archivedOptimizers: NonNegativeIntegerSchema,
  inactiveCards: NonNegativeIntegerSchema,
  reviewEvents: NonNegativeIntegerSchema,
  targets: NonNegativeIntegerSchema,
  vacuumed: Schema.Boolean,
})

export const ReviewResultSchema: EffectSchema.Codec<ReviewResult> = Schema.Struct({
  eventId: Schema.NonEmptyString,
  state: LearningStateSchema,
})

export const MultiLineReviewResultSchema: EffectSchema.Codec<MultiLineReviewResult> = Schema.Struct({
  itemResults: Schema.Array(ReviewResultSchema),
  mainResult: ReviewResultSchema,
})

export const PreparedLearningReviewSchema: EffectSchema.Codec<PreparedLearningReview> = Schema.Struct({
  eventId: Schema.NonEmptyString,
  expectedOptimizerRevisionId: Schema.NonEmptyString,
  expectedStateHash: Schema.NonEmptyString,
  expectedWinningEventId: nullable(Schema.NonEmptyString),
  outcomes: Schema.Struct({
    again: Schema.Struct({ intervalMilliseconds: NonNegativeIntegerSchema, state: LearningStateSchema }),
    easy: Schema.Struct({ intervalMilliseconds: NonNegativeIntegerSchema, state: LearningStateSchema }),
    good: Schema.Struct({ intervalMilliseconds: NonNegativeIntegerSchema, state: LearningStateSchema }),
    hard: Schema.Struct({ intervalMilliseconds: NonNegativeIntegerSchema, state: LearningStateSchema }),
  }),
  reviewedAt: Schema.Number,
  targetId: Schema.NonEmptyString,
})

export const DesktopReviewItemSchema: EffectSchema.Codec<DesktopReviewItem | null, EffectSchema.Json> = nullable(Schema.Struct({
  card: jsonValue(),
  mainTargetId: Schema.NonEmptyString,
  noteTitle: Schema.String,
  queue: LearningQueueItemSchema,
  targets: Schema.Array(Schema.Struct({
    itemBlockId: nullable(Schema.NonEmptyString),
    targetId: Schema.NonEmptyString,
  })),
  topicTitle: Schema.String,
  updatedAt: Schema.Number,
})) as unknown as EffectSchema.Codec<DesktopReviewItem | null, EffectSchema.Json>

export const CreateFsrsOptimizerInputSchema: EffectSchema.Codec<CreateFsrsOptimizerInput> = Schema.Struct({
  configuration: Schema.optionalKey(FsrsOptimizerConfigurationSchema),
  id: Schema.optionalKey(Schema.NonEmptyString),
  name: Schema.String,
})

export const SaveFsrsOptimizerInputSchema: EffectSchema.Codec<SaveFsrsOptimizerInput> = Schema.Struct({
  configuration: FsrsOptimizerConfigurationSchema,
  name: Schema.String,
  optimizerId: Schema.NonEmptyString,
  rescheduleNow: Schema.optionalKey(Schema.Boolean),
})

export const OptimizeFsrsOptimizerInputSchema: EffectSchema.Codec<OptimizeFsrsOptimizerInput> = Schema.Struct({
  optimizerId: Schema.NonEmptyString,
  rescheduleNow: Schema.optionalKey(Schema.Boolean),
  timeoutMilliseconds: Schema.optionalKey(PositiveIntegerSchema),
})

export const AssignNoteOptimizerInputSchema: EffectSchema.Codec<AssignNoteOptimizerInput> = Schema.Struct({
  noteId: Schema.NonEmptyString,
  optimizerId: Schema.NonEmptyString,
})

export const PrepareLearningReviewInputSchema: EffectSchema.Codec<PrepareLearningReviewInput> = Schema.Struct({
  reviewedAt: Schema.optionalKey(Schema.Number),
  targetId: Schema.NonEmptyString,
})

export const RateLearningTargetInputSchema: EffectSchema.Codec<RateLearningTargetInput> = Schema.Union([
  Schema.Struct({
    eventId: Schema.optionalKey(Schema.NonEmptyString),
    rating: ReviewRatingSchema,
    responseMilliseconds: Schema.optionalKey(NonNegativeIntegerSchema),
    reviewedAt: Schema.optionalKey(Schema.Number),
    targetId: Schema.NonEmptyString,
  }),
  Schema.Struct({
    eventId: Schema.NonEmptyString,
    expectedOptimizerRevisionId: Schema.NonEmptyString,
    expectedStateHash: Schema.NonEmptyString,
    expectedWinningEventId: nullable(Schema.NonEmptyString),
    rating: ReviewRatingSchema,
    responseMilliseconds: Schema.optionalKey(NonNegativeIntegerSchema),
    reviewedAt: Schema.Number,
    targetId: Schema.NonEmptyString,
  }),
])

export const RateMultiLineCardInputSchema: EffectSchema.Codec<RateMultiLineCardInput> = Schema.Struct({
  cardId: Schema.NonEmptyString,
  itemRatings: Schema.Array(Schema.Struct({
    eventId: Schema.NonEmptyString,
    expectedOptimizerRevisionId: Schema.NonEmptyString,
    expectedStateHash: Schema.NonEmptyString,
    expectedWinningEventId: nullable(Schema.NonEmptyString),
    rating: ReviewRatingSchema,
    responseMilliseconds: Schema.optionalKey(NonNegativeIntegerSchema),
    reviewedAt: Schema.Number,
    targetId: Schema.NonEmptyString,
  })),
  mainPreparation: Schema.Struct({
    eventId: Schema.NonEmptyString,
    expectedOptimizerRevisionId: Schema.NonEmptyString,
    expectedStateHash: Schema.NonEmptyString,
    expectedWinningEventId: nullable(Schema.NonEmptyString),
    reviewedAt: Schema.Number,
    targetId: Schema.NonEmptyString,
  }),
  responseMilliseconds: Schema.optionalKey(NonNegativeIntegerSchema),
  setRating: Schema.optionalKey(ReviewRatingSchema),
})

export const ResetLearningTargetInputSchema: EffectSchema.Codec<ResetLearningTargetInput> = Schema.Struct({
  eventId: Schema.optionalKey(Schema.NonEmptyString),
  resetAt: Schema.optionalKey(Schema.Number),
  targetId: Schema.NonEmptyString,
})

export const UndoLearningReviewInputSchema: EffectSchema.Codec<UndoLearningReviewInput> = Schema.Struct({
  eventId: Schema.optionalKey(Schema.NonEmptyString),
  expectedReviewEventId: Schema.optionalKey(Schema.NonEmptyString),
  targetId: Schema.NonEmptyString,
  undoneAt: Schema.optionalKey(Schema.Number),
})

export const UndoLearningReviewsInputSchema: EffectSchema.Codec<UndoLearningReviewsInput> = Schema.Struct({
  reviews: Schema.Array(Schema.Struct({
    eventId: Schema.NonEmptyString,
    expectedReviewEventId: Schema.NonEmptyString,
    targetId: Schema.NonEmptyString,
  })),
  undoneAt: Schema.optionalKey(Schema.Number),
})

export const GetLearningActivitySummaryInputSchema: EffectSchema.Codec<GetLearningActivitySummaryInput> = Schema.Struct({
  days: Schema.optionalKey(PositiveIntegerSchema),
  now: Schema.optionalKey(Schema.Number),
})

export const ListLearningQueueInputSchema: EffectSchema.Codec<ListLearningQueueInput> = Schema.Struct({
  limit: Schema.optionalKey(PositiveIntegerSchema),
  mode: Schema.optionalKey(LearningQueueModeSchema),
  noteId: Schema.optionalKey(Schema.NonEmptyString),
  now: Schema.optionalKey(Schema.Number),
  topicId: Schema.optionalKey(Schema.NonEmptyString),
})

export const GetNextDesktopReviewItemInputSchema: EffectSchema.Codec<GetNextDesktopReviewItemInput> = ListLearningQueueInputSchema
export const RestoreDesktopReviewItemInputSchema: EffectSchema.Codec<RestoreDesktopReviewItemInput> = Schema.Struct({
  cardId: Schema.NonEmptyString,
  noteId: Schema.NonEmptyString,
  presentation: Schema.Literals(['full', 'partial']),
  targetId: Schema.NonEmptyString,
  topicId: Schema.NonEmptyString,
})

export const LearningSchemaArguments = {
  archiveOptimizer: Schema.Tuple([Schema.NonEmptyString]),
  assignNoteOptimizer: Schema.Tuple([AssignNoteOptimizerInputSchema]),
  createOptimizer: Schema.Tuple([CreateFsrsOptimizerInputSchema]),
  getActivitySummary: optionalArgument(GetLearningActivitySummaryInputSchema),
  getDailyProgress: Schema.Union([Schema.Tuple([]), Schema.Tuple([Schema.Number])]),
  getLearningState: Schema.Tuple([Schema.NonEmptyString]),
  getMaintenanceEstimate: EmptyArgumentsSchema,
  getNextItem: optionalArgument(GetNextDesktopReviewItemInputSchema),
  getNextNewItem: optionalArgument(GetNextDesktopReviewItemInputSchema),
  getNextReviewItem: optionalArgument(GetNextDesktopReviewItemInputSchema),
  getNoteOptimizer: Schema.Tuple([Schema.NonEmptyString]),
  getOptimizer: Schema.Tuple([Schema.NonEmptyString]),
  getOptimizerNoteCount: Schema.Tuple([Schema.NonEmptyString]),
  listNotesWithCards: EmptyArgumentsSchema,
  listOptimizers: EmptyArgumentsSchema,
  listQueue: optionalArgument(ListLearningQueueInputSchema),
  listTargets: Schema.Tuple([Schema.NonEmptyString]),
  maintainDatabase: EmptyArgumentsSchema,
  optimizeOptimizer: Schema.Tuple([OptimizeFsrsOptimizerInputSchema]),
  prepareReview: Schema.Tuple([PrepareLearningReviewInputSchema]),
  rateMultiLineCard: Schema.Tuple([RateMultiLineCardInputSchema]),
  rateTarget: Schema.Tuple([RateLearningTargetInputSchema]),
  resetOptimizerDefaults: Schema.Union([Schema.Tuple([Schema.NonEmptyString]), Schema.Tuple([Schema.NonEmptyString, Schema.Boolean])]),
  resetTarget: Schema.Tuple([ResetLearningTargetInputSchema]),
  restoreReviewItem: Schema.Tuple([RestoreDesktopReviewItemInputSchema]),
  saveOptimizer: Schema.Tuple([SaveFsrsOptimizerInputSchema]),
  undoLastReview: Schema.Tuple([UndoLearningReviewInputSchema]),
  undoReviews: Schema.Tuple([UndoLearningReviewsInputSchema]),
}
