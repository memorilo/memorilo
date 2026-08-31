import type { DatabaseCommand, EditorStorageDatabase, StorageOperationRunner } from '../database-driver'
import type { LearningCardReconciliationInput } from './learning-card-reconciliation'
import type {
  LearningCardStorage,
  LearningMaintenanceStorage,
  LearningOptimizerStorage,
  LearningPracticeConfiguration,
  LearningQueueStorage,
  LearningReviewStorage,
  LearningStorage,
  LearningSyncStorage,
  ReadingItemProjection,
} from './types'
import {
  defaultLearningPracticeConfiguration,
  defaultOptimizerConfiguration,
  FSRSVersion,
} from '@memorilo/srs'
import { eq } from 'drizzle-orm'
import { v7 as createUuidV7 } from 'uuid'
import { learningOptimizerRevisions, learningOptimizers, learningSyncState } from '../drizzle-schema'
import { LearningCardRepository } from './learning-card-repository'
import { LearningMaintenanceRepository } from './learning-maintenance-repository'
import { LearningOptimizerCatalog } from './learning-optimizer-catalog'
import { LearningOptimizerRepository } from './learning-optimizer-repository'
import { LearningQueueRepository } from './learning-queue-repository'
import { LearningReadingItemRepository } from './learning-reading-item-repository'
import { LearningReviewHistory } from './learning-review-history'
import { LearningReviewRepository } from './learning-review-repository'
import { LearningSyncRepository } from './learning-sync-repository'
import {
  GLOBAL_OPTIMIZER_ID,
  GLOBAL_OPTIMIZER_REVISION_ID,
} from './schema'

const learningSchemaGeneration = 1

interface LearningSchemaStateRow {
  schema_generation: number
}

export class SqliteLearningStorage implements LearningStorage {
  readonly cards: LearningCardStorage
  readonly #cardRepository: LearningCardRepository
  readonly #readingItemRepository: LearningReadingItemRepository
  readonly maintenance: LearningMaintenanceStorage
  readonly optimizers: LearningOptimizerStorage
  readonly queue: LearningQueueStorage
  readonly readingItems: import('./types').LearningReadingItemStorage
  readonly reviews: LearningReviewStorage
  readonly sync: LearningSyncStorage

  private constructor(
    database: EditorStorageDatabase,
    configuration: () => LearningPracticeConfiguration,
    runOperation: StorageOperationRunner,
  ) {
    this.maintenance = new LearningMaintenanceRepository({
      database,
      runOperation,
    })
    this.sync = new LearningSyncRepository({
      database,
      runOperation,
    })
    const reviewHistory = new LearningReviewHistory(database)
    const optimizerCatalog = new LearningOptimizerCatalog(database)
    this.reviews = new LearningReviewRepository({
      database,
      history: reviewHistory,
      resolveOptimizer: noteId => optimizerCatalog.effective(noteId),
      runOperation,
    })
    this.optimizers = new LearningOptimizerRepository({
      catalog: optimizerCatalog,
      database,
      history: reviewHistory,
      runOperation,
    })
    this.queue = new LearningQueueRepository({
      configuration,
      database,
      history: reviewHistory,
      runOperation,
    })
    this.#readingItemRepository = new LearningReadingItemRepository(database, runOperation)
    this.readingItems = this.#readingItemRepository
    this.#cardRepository = new LearningCardRepository({
      database,
      effectiveOptimizer: noteId => optimizerCatalog.effective(noteId),
      runOperation,
    })
    this.cards = this.#cardRepository
  }

  static async open(
    database: EditorStorageDatabase,
    runOperation: StorageOperationRunner,
    configuration: () => LearningPracticeConfiguration = defaultLearningPracticeConfiguration,
  ): Promise<SqliteLearningStorage> {
    // Learning tables are part of the editor-storage Drizzle migration and are
    // initialized before this service is opened.
    const orm = database.drizzle
    if (orm === undefined)
      throw new TypeError('Editor storage requires a Drizzle database handle')
    const schemaState = orm.select({ schema_generation: learningSyncState.schemaGeneration }).from(learningSyncState).where(eq(learningSyncState.singleton, 1)).get() as LearningSchemaStateRow | undefined
    if (schemaState && schemaState.schema_generation !== learningSchemaGeneration) {
      throw new Error(
        `Unsupported Learning schema generation ${schemaState.schema_generation}; expected ${learningSchemaGeneration}`,
      )
    }
    const now = Date.now()
    const optimizerConfiguration = defaultOptimizerConfiguration()
    orm.transaction((transaction) => {
      transaction.insert(learningOptimizers).values({
        optimizerId: GLOBAL_OPTIMIZER_ID,
        name: 'Global',
        isGlobal: 1,
        status: 'active',
        currentRevisionId: null,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing().run()
      transaction.insert(learningOptimizerRevisions).values({
        revisionId: GLOBAL_OPTIMIZER_REVISION_ID,
        optimizerId: GLOBAL_OPTIMIZER_ID,
        configurationJson: JSON.stringify(optimizerConfiguration),
        fsrsVersion: FSRSVersion,
        createdAt: now,
      }).onConflictDoNothing().run()
      transaction.update(learningOptimizers).set({ currentRevisionId: GLOBAL_OPTIMIZER_REVISION_ID }).where(eq(learningOptimizers.optimizerId, GLOBAL_OPTIMIZER_ID)).run()
      transaction.insert(learningSyncState).values({
        singleton: 1,
        deviceId: createUuidV7(),
        nextDeviceSequence: 1,
        lastServerSequence: 0,
        schemaGeneration: learningSchemaGeneration,
      }).onConflictDoNothing().run()
    })
    return new SqliteLearningStorage(database, configuration, runOperation)
  }

  planCardReconciliation(input: LearningCardReconciliationInput): Promise<readonly DatabaseCommand[]> {
    return this.#cardRepository.planReconciliation(input)
  }

  async planReadingItemReconciliation(noteId: string, items: readonly ReadingItemProjection[]): Promise<readonly DatabaseCommand[]> {
    const byTopic = new Map<string, ReadingItemProjection[]>()
    for (const item of items) {
      const topicItems = byTopic.get(item.topicId) ?? []
      topicItems.push(item)
      byTopic.set(item.topicId, topicItems)
    }
    const existingTopics = await this.#readingItemRepository.listTopics(noteId)
    for (const topicId of existingTopics) {
      if (!byTopic.has(topicId))
        byTopic.set(topicId, [])
    }
    const commands: DatabaseCommand[] = []
    for (const [topicId, topicItems] of byTopic)
      commands.push(...await this.#readingItemRepository.planReconciliation(noteId, topicId, topicItems))
    return commands
  }
}
