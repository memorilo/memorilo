import type {
  ActivateLearningReviewOptions,
  ActiveLearningReview,
  LearningReviewProjection,
  LearningReviewRatingDecision,
  PreparedLearningReview,
  ReviewPreparationRequest,
  LearningReviewRatingModel as SharedLearningReviewRatingModel,
} from '@memorilo/application/learning-review'
import type { DesktopLearningApi, DesktopReviewItem } from '@memorilo/desktop-api'
import type { ReviewRating } from '@memorilo/editor-storage'
import { createLearningReviewRatingModel as createSharedLearningReviewRatingModel } from '@memorilo/application/learning-review'

export type PreparedReview = PreparedLearningReview
export type ActiveReview = ActiveLearningReview
export type ActivateReviewOptions = ActivateLearningReviewOptions
export type ReviewProjection = LearningReviewProjection
export type ReviewRatingDecision = LearningReviewRatingDecision
export type { ReviewPreparationRequest, ReviewRating }

export interface LearningReviewRatingModel extends Omit<SharedLearningReviewRatingModel, 'activate'> {
  activate: (item: DesktopReviewItem, options?: ActivateReviewOptions) => ActiveReview
}

export function createLearningReviewRatingModel(
  adapter: Pick<DesktopLearningApi, 'rateMultiLineCard' | 'rateTarget' | 'undoReviews'>,
  now: () => number = Date.now,
  createId: () => string = () => crypto.randomUUID(),
): LearningReviewRatingModel {
  return createSharedLearningReviewRatingModel({
    rateMultiLineCard: adapter.rateMultiLineCard,
    rateTarget: adapter.rateTarget,
    undoMany: input => adapter.undoReviews(input),
  }, now, createId)
}
