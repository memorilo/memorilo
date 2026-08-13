import type { EditorStorageDatabase, StorageOperationRunner } from '../database-driver'
import type { LearningReviewHistory, LearningReviewOptimizer } from './learning-review-history'
import type {
  LearningReviewStorage,
  LearningState,
} from './types'
import { LearningRatingCommands } from './learning-rating-commands'
import { LearningReviewCommands } from './learning-review-commands'
import { LearningReviewContext } from './learning-review-context'
import { assertNonEmpty, toLearningState } from './learning-storage-shared'

export class LearningReviewRepository implements LearningReviewStorage {
  readonly #commands: LearningReviewCommands
  readonly #context: LearningReviewContext
  readonly #rating: LearningRatingCommands
  readonly #runOperation: StorageOperationRunner

  constructor(dependencies: {
    database: EditorStorageDatabase
    history: LearningReviewHistory
    resolveOptimizer: (noteId: string) => Promise<LearningReviewOptimizer>
    runOperation: StorageOperationRunner
  }) {
    this.#context = new LearningReviewContext({
      database: dependencies.database,
      history: dependencies.history,
      resolveOptimizer: dependencies.resolveOptimizer,
    })
    this.#rating = new LearningRatingCommands(this.#context)
    this.#commands = new LearningReviewCommands(this.#context)
    this.#runOperation = dependencies.runOperation
  }

  getState(targetId: string): Promise<LearningState> {
    assertNonEmpty(targetId, 'Review Target id')
    return this.#runOperation(async () => toLearningState(await this.#context.stateRow(targetId)))
  }

  prepare: LearningReviewStorage['prepare'] = input => (
    this.#runOperation(() => this.#rating.prepareReview(input))
  )

  rateMultiLineCard: LearningReviewStorage['rateMultiLineCard'] = input => (
    this.#runOperation(() => this.#rating.rateMultiLineCard(input))
  )

  rateTarget: LearningReviewStorage['rateTarget'] = input => (
    this.#runOperation(() => this.#rating.rateTarget(input))
  )

  resetTarget: LearningReviewStorage['resetTarget'] = input => (
    this.#runOperation(() => this.#commands.resetTarget(input))
  )

  undoLast: LearningReviewStorage['undoLast'] = input => (
    this.#runOperation(() => this.#commands.undoLastReview(input))
  )

  undoMany: LearningReviewStorage['undoMany'] = input => (
    this.#runOperation(() => this.#commands.undoReviews(input))
  )
}
