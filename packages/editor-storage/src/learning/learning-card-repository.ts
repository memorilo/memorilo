import type { DatabaseCommand, EditorStorageDatabase, StorageOperationRunner } from '../database-driver'
import type { LearningCardReconciliationInput } from './learning-card-reconciliation'
import type { EffectiveLearningOptimizer } from './learning-optimizer-catalog'
import type {
  LearningNoteSummary,
  LearningTarget,
  ReconcileLearningCardsInput,
} from './types'
import { planLearningCardReconciliation } from './learning-card-reconciliation'
import { assertNonEmpty } from './learning-storage-shared'
import { GLOBAL_OPTIMIZER_ID } from './schema'

interface TargetRow {
  active: number
  card_active: number
  card_id: string
  created_at: number
  direction: 'backward' | 'forward'
  item_block_id: string | null
  kind: 'basic' | 'cloze' | 'list' | 'set'
  note_id: string
  partial_active: number
  source_block_id: string
  source_order: number
  target_id: string
  target_order: number
  target_kind: 'item' | 'whole'
  topic_id: string
  topic_order: number
}

interface LearningNoteSummaryRow {
  card_count: number
  note_id: string
  note_title: string
  optimizer_id: string
  optimizer_is_global: number
  optimizer_name: string
  optimizer_status: 'active' | 'archived'
  topic_count: number
  updated_at: number
}

interface LearningCardRepositoryDependencies {
  database: EditorStorageDatabase
  effectiveOptimizer: (noteId: string) => Promise<EffectiveLearningOptimizer>
  runOperation: StorageOperationRunner
}

function toLearningTarget(row: TargetRow): LearningTarget {
  return {
    active: row.active === 1 && row.card_active === 1,
    cardId: row.card_id,
    itemBlockId: row.item_block_id,
    kind: row.target_kind,
    partialActive: row.partial_active === 1,
    targetId: row.target_id,
  }
}

export class LearningCardRepository {
  readonly #database: EditorStorageDatabase
  readonly #effectiveOptimizer: LearningCardRepositoryDependencies['effectiveOptimizer']
  readonly #runOperation: StorageOperationRunner

  constructor(dependencies: LearningCardRepositoryDependencies) {
    this.#database = dependencies.database
    this.#effectiveOptimizer = dependencies.effectiveOptimizer
    this.#runOperation = dependencies.runOperation
  }

  planReconciliation(input: LearningCardReconciliationInput): Promise<readonly DatabaseCommand[]> {
    return planLearningCardReconciliation({
      database: this.#database,
      effectiveOptimizer: this.#effectiveOptimizer,
    }, input)
  }

  reconcileTopicCards(input: ReconcileLearningCardsInput): Promise<void> {
    return this.#runOperation(async () => {
      const commands = await this.planReconciliation({
        noteId: input.noteId,
        topics: [{ cards: input.cards, topicId: input.topicId, topicOrder: input.topicOrder }],
      })
      if (commands.length > 0)
        await this.#database.batch(commands)
    })
  }

  listTargets(cardIdValue: string): Promise<readonly LearningTarget[]> {
    assertNonEmpty(cardIdValue, 'CardID')
    return this.#runOperation(async () => {
      const rows = await this.#database.all<TargetRow>(
        'SELECT t.target_id, t.card_id, t.target_kind, t.target_order, t.item_block_id, t.active, t.partial_active, t.created_at, c.active AS card_active, c.note_id, c.topic_id, c.topic_order, c.source_block_id, c.source_order, c.kind, c.direction FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id WHERE t.card_id = ? ORDER BY t.target_order, t.target_id',
        [cardIdValue],
      )
      return rows.map(toLearningTarget)
    })
  }

  listNoteTopicIds(noteId: string): Promise<readonly string[]> {
    assertNonEmpty(noteId, 'Note id')
    return this.#runOperation(async () => {
      const rows = await this.#database.all<{ topic_id: string }>(
        'SELECT DISTINCT topic_id FROM learning_cards WHERE note_id = ? ORDER BY topic_id',
        [noteId],
      )
      return rows.map(row => row.topic_id)
    })
  }

  listNotesWithCards(): Promise<readonly LearningNoteSummary[]> {
    return this.#runOperation(async () => {
      const rows = await this.#database.all<LearningNoteSummaryRow>(`
        WITH card_topics AS (
          SELECT
            note_id,
            topic_id,
            COUNT(*) AS card_count
          FROM learning_cards
          WHERE active = 1
          GROUP BY note_id, topic_id
        )
        SELECT
          note.id AS note_id,
          note.title AS note_title,
          note.updated_at,
          optimizer.optimizer_id,
          optimizer.name AS optimizer_name,
          optimizer.is_global AS optimizer_is_global,
          optimizer.status AS optimizer_status,
          SUM(card_topics.card_count) AS card_count,
          COUNT(*) AS topic_count
        FROM card_topics
        INNER JOIN notes AS note ON note.id = card_topics.note_id
        LEFT JOIN learning_note_optimizer_assignments AS assignment ON assignment.note_id = note.id
        INNER JOIN learning_optimizers AS optimizer
          ON optimizer.optimizer_id = COALESCE(assignment.optimizer_id, ?)
        GROUP BY
          note.id,
          note.title,
          note.updated_at,
          optimizer.optimizer_id,
          optimizer.name,
          optimizer.is_global,
          optimizer.status
        ORDER BY note.updated_at DESC, note.id DESC
      `, [GLOBAL_OPTIMIZER_ID])
      return rows.map((row) => {
        if (row.optimizer_status !== 'active')
          throw new Error(`Note ${row.note_id} references archived FSRS Optimizer ${row.optimizer_id}`)
        return {
          cardCount: row.card_count,
          noteId: row.note_id,
          noteTitle: row.note_title,
          optimizer: {
            id: row.optimizer_id,
            isGlobal: row.optimizer_is_global === 1,
            name: row.optimizer_name,
          },
          topicCount: row.topic_count,
          updatedAt: row.updated_at,
        }
      })
    })
  }
}
