import type { LearningStorage } from '@memorilo/editor-storage'
import type { LearningReviewApplication } from '../learning/learning-review-application'
import { IpcMethod, IpcService } from 'electron-ipc-decorator'

export function createLearningService(
  learning: LearningStorage,
  reviews: LearningReviewApplication,
) {
  class LearningService extends IpcService {
    static override readonly groupName = 'learning'

    @IpcMethod()
    archiveOptimizer(optimizerId: string) {
      return learning.archiveOptimizer(optimizerId)
    }

    @IpcMethod()
    assignNoteOptimizer(input: Parameters<LearningStorage['assignNoteOptimizer']>[0]) {
      return learning.assignNoteOptimizer(input)
    }

    @IpcMethod()
    createOptimizer(input: Parameters<LearningStorage['createOptimizer']>[0]) {
      return learning.createOptimizer(input)
    }

    @IpcMethod()
    getDailyProgress(now?: number) {
      return learning.getDailyProgress(now)
    }

    @IpcMethod()
    getLearningState(targetId: string) {
      return learning.getLearningState(targetId)
    }

    @IpcMethod()
    getMaintenanceEstimate() {
      return learning.getMaintenanceEstimate()
    }

    @IpcMethod()
    getNextNewItem(input?: Parameters<LearningReviewApplication['getNextNewItem']>[0]) {
      return reviews.getNextNewItem(input)
    }

    @IpcMethod()
    getNextReviewItem(input?: Parameters<LearningReviewApplication['getNextReviewItem']>[0]) {
      return reviews.getNextReviewItem(input)
    }

    @IpcMethod()
    getNoteOptimizer(noteId: string) {
      return learning.getNoteOptimizer(noteId)
    }

    @IpcMethod()
    getOptimizer(optimizerId: string) {
      return learning.getOptimizer(optimizerId)
    }

    @IpcMethod()
    getOptimizerNoteCount(optimizerId: string) {
      return learning.getOptimizerNoteCount(optimizerId)
    }

    @IpcMethod()
    listOptimizers() {
      return learning.listOptimizers()
    }

    @IpcMethod()
    listNotesWithCards() {
      return learning.listNotesWithCards()
    }

    @IpcMethod()
    listQueue(input?: Parameters<LearningStorage['listQueue']>[0]) {
      return learning.listQueue(input)
    }

    @IpcMethod()
    listTargets(cardId: string) {
      return learning.listTargets(cardId)
    }

    @IpcMethod()
    maintainDatabase() {
      return learning.maintainDatabase()
    }

    @IpcMethod()
    optimizeOptimizer(input: Parameters<LearningStorage['optimizeOptimizer']>[0]) {
      return learning.optimizeOptimizer(input)
    }

    @IpcMethod()
    prepareReview(input: Parameters<LearningStorage['prepareReview']>[0]) {
      return learning.prepareReview(input)
    }

    @IpcMethod()
    rateTarget(input: Parameters<LearningStorage['rateTarget']>[0]) {
      return learning.rateTarget(input)
    }

    @IpcMethod()
    renameOptimizer(input: Parameters<LearningStorage['renameOptimizer']>[0]) {
      return learning.renameOptimizer(input)
    }

    @IpcMethod()
    resetOptimizerDefaults(
      optimizerId: string,
      rescheduleNow?: boolean,
    ) {
      return learning.resetOptimizerDefaults(optimizerId, rescheduleNow)
    }

    @IpcMethod()
    resetTarget(input: Parameters<LearningStorage['resetTarget']>[0]) {
      return learning.resetTarget(input)
    }

    @IpcMethod()
    undoLastReview(input: Parameters<LearningStorage['undoLastReview']>[0]) {
      return learning.undoLastReview(input)
    }

    @IpcMethod()
    updateOptimizer(input: Parameters<LearningStorage['updateOptimizer']>[0]) {
      return learning.updateOptimizer(input)
    }
  }

  return LearningService
}
