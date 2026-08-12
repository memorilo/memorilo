import type { RatingHistory } from '@memorilo/srs'
import type { EditorStorageDatabase, StorageOperationRunner } from '../database-driver'
import type { LearningOptimizerCatalog } from './learning-optimizer-catalog'
import type { LearningReviewHistory } from './learning-review-history'
import type {
  AssignNoteOptimizerInput,
  CreateFsrsOptimizerInput,
  FsrsOptimizer,
  OptimizeFsrsOptimizerInput,
  SaveFsrsOptimizerInput,
} from './types'
import { fingerprintRatingHistories, optimizeFsrsParameters } from '@memorilo/srs'
import { LearningOptimizerMutations } from './learning-optimizer-mutations'
import { LearningOptimizerRescheduler } from './learning-optimizer-rescheduler'
import { assertNonEmpty } from './learning-storage-shared'

interface LearningOptimizerRepositoryDependencies {
  catalog: LearningOptimizerCatalog
  database: EditorStorageDatabase
  history: Pick<LearningReviewHistory, 'buildRescheduleCommands' | 'getRatingHistory'>
  runOperation: StorageOperationRunner
}

export class LearningOptimizerRepository {
  readonly #catalog: LearningOptimizerCatalog
  readonly #history: LearningOptimizerRepositoryDependencies['history']
  readonly #mutations: LearningOptimizerMutations
  readonly #rescheduler: LearningOptimizerRescheduler
  readonly #runOperation: LearningOptimizerRepositoryDependencies['runOperation']

  constructor(dependencies: LearningOptimizerRepositoryDependencies) {
    this.#runOperation = dependencies.runOperation
    this.#catalog = dependencies.catalog
    this.#history = dependencies.history
    this.#rescheduler = new LearningOptimizerRescheduler({
      database: dependencies.database,
      history: dependencies.history,
      resolveOptimizer: noteId => this.#catalog.effective(noteId),
    })
    this.#mutations = new LearningOptimizerMutations({
      catalog: this.#catalog,
      database: dependencies.database,
      rescheduler: this.#rescheduler,
    })
  }

  async #loadTrainingData(optimizerId: string): Promise<{
    fingerprint: string
    histories: readonly RatingHistory[]
  }> {
    const histories: RatingHistory[] = []
    const targets = [...await this.#rescheduler.listTargets(optimizerId)]
      .sort((left, right) => left.target_id.localeCompare(right.target_id))
    for (const target of targets) {
      const history = await this.#history.getRatingHistory(target.target_id)
      if (history)
        histories.push(history)
    }
    return {
      fingerprint: fingerprintRatingHistories(histories),
      histories,
    }
  }

  archive(optimizerId: string): Promise<void> {
    return this.#runOperation(() => this.#mutations.archive(optimizerId))
  }

  assignToNote(input: AssignNoteOptimizerInput): Promise<void> {
    return this.#runOperation(() => this.#mutations.assignNote(input))
  }

  create(input: CreateFsrsOptimizerInput): Promise<FsrsOptimizer> {
    return this.#runOperation(() => this.#mutations.create(input))
  }

  getForNote(noteId: string): Promise<FsrsOptimizer> {
    return this.#runOperation(() => this.#catalog.getNote(noteId))
  }

  get(optimizerId: string): Promise<FsrsOptimizer> {
    return this.#runOperation(() => this.#catalog.get(optimizerId))
  }

  getNoteCount(optimizerId: string): Promise<number> {
    return this.#runOperation(() => this.#catalog.getNoteCount(optimizerId))
  }

  list(): Promise<readonly FsrsOptimizer[]> {
    return this.#runOperation(() => this.#catalog.list())
  }

  optimize(input: OptimizeFsrsOptimizerInput): Promise<FsrsOptimizer> {
    assertNonEmpty(input.optimizerId, 'FSRS Optimizer id')
    return this.#runOperation(async () => {
      const optimizer = await this.#catalog.get(input.optimizerId)
      if (optimizer.status !== 'active')
        throw new Error(`Cannot optimize archived FSRS Optimizer ${input.optimizerId}`)
      const snapshot = {
        configuration: optimizer.configuration,
        data: await this.#loadTrainingData(input.optimizerId),
        name: optimizer.name,
        revisionId: optimizer.revisionId,
      }
      if (snapshot.data.histories.length === 0)
        throw new Error(`FSRS Optimizer ${input.optimizerId} has no eligible Review Events`)
      const optimizedConfiguration = await optimizeFsrsParameters(
        snapshot.data.histories,
        snapshot.configuration,
        input.timeoutMilliseconds,
      )
      const currentData = await this.#loadTrainingData(input.optimizerId)
      if (currentData.fingerprint !== snapshot.data.fingerprint)
        throw new Error(`FSRS Optimizer ${input.optimizerId} training data changed while optimization was running`)
      return this.#mutations.save({
        configuration: optimizedConfiguration,
        name: snapshot.name,
        optimizerId: input.optimizerId,
        rescheduleNow: input.rescheduleNow,
      }, snapshot.revisionId)
    })
  }

  resetDefaults(optimizerId: string, rescheduleNow = false): Promise<FsrsOptimizer> {
    return this.#runOperation(() => this.#mutations.resetDefaults(optimizerId, rescheduleNow))
  }

  save(input: SaveFsrsOptimizerInput): Promise<FsrsOptimizer> {
    return this.#runOperation(() => this.#mutations.save(input))
  }
}
