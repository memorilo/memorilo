import type {
  LearningQueueItem,
  LearningQueueMode,
  LearningState,
  LearningTarget,
  MultiLineReviewResult,
  PreparedLearningReview,
  RateLearningTargetInput,
  RateMultiLineCardInput,
  ReviewResult,
  UndoLearningReviewsInput,
} from '@memorilo/editor-storage'
import type { EditorSurfaceSession } from './editor-surface-contract'

export interface LearningReviewSeed {
  note: EditorSurfaceSession
  queue: LearningQueueItem
  targets: readonly LearningTarget[]
}

export interface LearningSurfaceFunctions {
  loadNext: (mode: LearningQueueMode) => Promise<LearningReviewSeed | null>
  prepareReview: (targetId: string) => Promise<PreparedLearningReview>
  rateMultiLineCard: (input: RateMultiLineCardInput) => Promise<MultiLineReviewResult>
  rateTarget: (input: RateLearningTargetInput) => Promise<ReviewResult>
  undoMany: (input: UndoLearningReviewsInput) => Promise<readonly LearningState[]>
}
