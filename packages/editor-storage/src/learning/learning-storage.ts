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
import { v7 as createUuidV7 } from 'uuid'
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
  learningSchema,
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
    await database.exec(learningSchema)
    const schemaState = await database.get<LearningSchemaStateRow>(
      'SELECT schema_generation FROM learning_sync_state WHERE singleton = 1',
    )
    if (schemaState && schemaState.schema_generation !== learningSchemaGeneration) {
      throw new Error(
        `Unsupported Learning schema generation ${schemaState.schema_generation}; expected ${learningSchemaGeneration}`,
      )
    }
    const now = Date.now()
    const optimizerConfiguration = defaultOptimizerConfiguration()
    await database.batch([
      {
        parameters: [GLOBAL_OPTIMIZER_ID, 'Global', now, now],
        sql: 'INSERT INTO learning_optimizers (optimizer_id, name, is_global, status, created_at, updated_at) VALUES (?, ?, 1, \'active\', ?, ?) ON CONFLICT(optimizer_id) DO NOTHING',
      },
      {
        parameters: [
          GLOBAL_OPTIMIZER_REVISION_ID,
          GLOBAL_OPTIMIZER_ID,
          JSON.stringify(optimizerConfiguration),
          FSRSVersion,
          now,
        ],
        sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(revision_id) DO NOTHING',
      },
      {
        parameters: [GLOBAL_OPTIMIZER_REVISION_ID, GLOBAL_OPTIMIZER_ID],
        sql: 'UPDATE learning_optimizers SET current_revision_id = COALESCE(current_revision_id, ?) WHERE optimizer_id = ?',
      },
      {
        parameters: [createUuidV7(), learningSchemaGeneration],
        sql: 'INSERT INTO learning_sync_state (singleton, device_id, next_device_sequence, last_server_sequence, schema_generation) VALUES (1, ?, 1, 0, ?) ON CONFLICT(singleton) DO NOTHING',
      },
    ])
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
