import type { LearningQueueKind } from '@memorilo/srs'
import type { DatabaseCommand, EditorStorageDatabase, StorageOperationRunner } from '../database-driver'
import type { LearningCardReconciliationInput } from './learning-card-reconciliation'
import type { LearningStateRow } from './learning-storage-shared'
import type {
  LearningCardStorage,
  LearningMaintenanceStorage,
  LearningOptimizerStorage,
  LearningPracticeConfiguration,
  LearningQueueStorage,
  LearningReviewStorage,
  LearningStorage,
  LearningSyncStorage,
} from './types'
import {
  defaultLearningPracticeConfiguration,
  defaultOptimizerConfiguration,
  FSRSVersion,
  queueKindForState,
} from '@memorilo/srs'
import { v7 as createUuidV7 } from 'uuid'
import { LearningCardRepository } from './learning-card-repository'
import { LearningMaintenanceRepository } from './learning-maintenance-repository'
import { LearningOptimizerCatalog } from './learning-optimizer-catalog'
import { LearningOptimizerRepository } from './learning-optimizer-repository'
import { LearningQueueRepository } from './learning-queue-repository'
import { LearningReviewHistory } from './learning-review-history'
import { LearningReviewRepository } from './learning-review-repository'
import { LearningSyncRepository } from './learning-sync-repository'
import {
  GLOBAL_OPTIMIZER_ID,
  GLOBAL_OPTIMIZER_REVISION_ID,
  learningSchema,
} from './schema'

const learningSchemaGeneration = 3

interface SiblingBuryBackfillRow {
  base_event_id: string | null
  base_result_state_json: string | null
  card_id: string
  event_id: string
  note_id: string
  occurred_at: number
  scheduled_days: number | null
  source_block_id: string
}

function phaseFromStateSnapshot(json: string, eventId: string): LearningStateRow['phase'] {
  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== 'object' || !('phase' in parsed))
    throw new TypeError(`Review Event ${eventId} has an invalid base Learning State`)
  const phase = parsed.phase
  if (phase !== 'new' && phase !== 'learning' && phase !== 'relearning' && phase !== 'review')
    throw new TypeError(`Review Event ${eventId} has an unsupported base Learning phase`)
  return phase
}

async function backfillRecentSiblingBuryEvents(
  database: EditorStorageDatabase,
  now: number,
): Promise<void> {
  const rows = await database.all<SiblingBuryBackfillRow>(
    'SELECT e.event_id, e.card_id, e.note_id, e.occurred_at, e.scheduled_days, e.base_event_id, base.result_state_json AS base_result_state_json, c.source_block_id FROM learning_review_events e JOIN learning_cards c ON c.card_id = e.card_id LEFT JOIN learning_review_events base ON base.event_id = e.base_event_id LEFT JOIN learning_sibling_bury_events bury ON bury.source_event_id = e.event_id WHERE e.event_kind = \'rating\' AND e.occurred_at >= ? AND bury.source_event_id IS NULL',
    [Math.max(0, now - 2 * 86_400_000)],
  )
  const commands: DatabaseCommand[] = []
  for (const row of rows) {
    let sourceQueue: LearningQueueKind
    if (row.base_event_id === null) {
      sourceQueue = 'new'
    }
    else {
      if (row.base_result_state_json === null || row.scheduled_days === null)
        throw new Error(`Review Event ${row.event_id} cannot restore its sibling-bury queue`)
      sourceQueue = queueKindForState({
        phase: phaseFromStateSnapshot(row.base_result_state_json, row.event_id),
        scheduledDays: row.scheduled_days,
      })
    }
    commands.push({
      parameters: [
        row.event_id,
        row.card_id,
        row.note_id,
        row.source_block_id,
        sourceQueue,
        row.occurred_at,
      ],
      sql: 'INSERT INTO learning_sibling_bury_events (source_event_id, source_card_id, note_id, source_block_id, source_queue, occurred_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(source_event_id) DO NOTHING',
    })
  }
  if (commands.length > 0)
    await database.batch(commands)
}

export class SqliteLearningStorage implements LearningStorage {
  readonly cards: LearningCardStorage
  readonly #cardRepository: LearningCardRepository
  readonly maintenance: LearningMaintenanceStorage
  readonly optimizers: LearningOptimizerStorage
  readonly queue: LearningQueueStorage
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
        sql: 'INSERT INTO learning_sync_state (singleton, device_id, next_device_sequence, last_server_sequence, schema_generation) VALUES (1, ?, 1, 0, ?) ON CONFLICT(singleton) DO UPDATE SET schema_generation = MAX(learning_sync_state.schema_generation, excluded.schema_generation)',
      },
    ])
    await database.run(
      'INSERT INTO learning_card_introductions (card_id, introduced_at) SELECT e.card_id, MIN(e.occurred_at) FROM learning_review_events e WHERE e.event_kind = \'rating\' AND NOT EXISTS (SELECT 1 FROM learning_review_events u WHERE u.event_kind = \'undo\' AND u.undoes_event_id = e.event_id) GROUP BY e.card_id ON CONFLICT(card_id) DO UPDATE SET introduced_at = excluded.introduced_at',
    )
    await backfillRecentSiblingBuryEvents(database, now)
    return new SqliteLearningStorage(database, configuration, runOperation)
  }

  planCardReconciliation(input: LearningCardReconciliationInput): Promise<readonly DatabaseCommand[]> {
    return this.#cardRepository.planReconciliation(input)
  }
}
