import type { LearningStorage } from '@memorilo/editor-storage'
import type { DesktopRequestHandlers } from '../desktop-request-handlers'
import type { LearningReviewApplication } from '../learning/learning-review-application'

export function createLearningHandlers(
  learning: LearningStorage,
  reviews: LearningReviewApplication,
  now: () => number = Date.now,
  onLocalMutation: () => void = () => undefined,
): DesktopRequestHandlers['learning'] {
  const mutation = async <Result>(operation: Promise<Result>): Promise<Result> => {
    const result = await operation
    onLocalMutation()
    return result
  }

  return {
    archiveOptimizer(optimizerId: string) {
      return mutation(learning.optimizers.archive(optimizerId)).then(() => null)
    },
    assignNoteOptimizer(input: Parameters<LearningStorage['optimizers']['assignToNote']>[0]) {
      return mutation(learning.optimizers.assignToNote(input)).then(() => null)
    },
    createOptimizer(input: Parameters<LearningStorage['optimizers']['create']>[0]) {
      return mutation(learning.optimizers.create(input))
    },
    getActivitySummary(input?: Parameters<LearningStorage['queue']['getActivitySummary']>[0]) {
      return learning.queue.getActivitySummary({ ...input, now: input?.now ?? now() })
    },
    getDailyProgress(requestedAt?: number) {
      return learning.queue.getDailyProgress(requestedAt ?? now())
    },
    getLearningState(targetId: string) {
      return learning.reviews.getState(targetId)
    },
    getMaintenanceEstimate() {
      return learning.maintenance.getEstimate()
    },
    getNextLearningKind(input?: Parameters<LearningStorage['queue']['nextKind']>[0]) {
      return learning.queue.nextKind({ ...input, now: input?.now ?? now() })
    },
    getNextItem(input?: Parameters<LearningReviewApplication['getNextItem']>[0]) {
      return reviews.getNextItem(input)
    },
    getNextNewItem(input?: Parameters<LearningReviewApplication['getNextNewItem']>[0]) {
      return reviews.getNextNewItem(input)
    },
    getNextReviewItem(input?: Parameters<LearningReviewApplication['getNextReviewItem']>[0]) {
      return reviews.getNextReviewItem(input)
    },
    getNoteOptimizer(noteId: string) {
      return learning.optimizers.getForNote(noteId)
    },
    getOptimizer(optimizerId: string) {
      return learning.optimizers.get(optimizerId)
    },
    getOptimizerNoteCount(optimizerId: string) {
      return learning.optimizers.getNoteCount(optimizerId)
    },
    listOptimizers() {
      return learning.optimizers.list()
    },
    listNotesWithCards() {
      return learning.cards.listNotesWithCards()
    },
    listQueue(input?: Parameters<LearningStorage['queue']['list']>[0]) {
      return learning.queue.list({ ...input, now: input?.now ?? now() })
    },
    listTargets(cardId: string) {
      return learning.cards.listTargets(cardId)
    },
    listReadingItems(input?: Parameters<LearningStorage['readingItems']['list']>[0]) {
      return learning.readingItems.list({ ...input, now: input?.now ?? now() })
    },
    processReadingItem(input: Parameters<LearningStorage['readingItems']['process']>[0]) {
      return mutation(learning.readingItems.process(input))
    },
    maintainDatabase() {
      return mutation(learning.maintenance.maintain())
    },
    optimizeOptimizer(input: Parameters<LearningStorage['optimizers']['optimize']>[0]) {
      return mutation(learning.optimizers.optimize(input))
    },
    prepareReview(input: Parameters<LearningStorage['reviews']['prepare']>[0]) {
      return learning.reviews.prepare({
        ...input,
        reviewedAt: input.reviewedAt ?? now(),
      })
    },
    rateMultiLineCard(input: Parameters<LearningStorage['reviews']['rateMultiLineCard']>[0]) {
      return mutation(learning.reviews.rateMultiLineCard(input))
    },
    rateTarget(input: Parameters<LearningStorage['reviews']['rateTarget']>[0]) {
      return mutation(learning.reviews.rateTarget(input))
    },
    resetOptimizerDefaults(
      optimizerId: string,
      rescheduleNow?: boolean,
    ) {
      return mutation(learning.optimizers.resetDefaults(optimizerId, rescheduleNow))
    },
    resetTarget(input: Parameters<LearningStorage['reviews']['resetTarget']>[0]) {
      return mutation(learning.reviews.resetTarget(input))
    },
    restoreReviewItem(input: Parameters<LearningReviewApplication['restoreReviewItem']>[0]) {
      return reviews.restoreReviewItem(input)
    },
    undoLastReview(input: Parameters<LearningStorage['reviews']['undoLast']>[0]) {
      return mutation(learning.reviews.undoLast(input))
    },
    undoReviews(input: Parameters<LearningStorage['reviews']['undoMany']>[0]) {
      return mutation(learning.reviews.undoMany(input))
    },
    saveOptimizer(input: Parameters<LearningStorage['optimizers']['save']>[0]) {
      return mutation(learning.optimizers.save(input))
    },
  }
}
