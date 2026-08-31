import type { DatabaseCommand, EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from '../database-driver'
import type { LearningCardReconciliationInput } from './learning-card-reconciliation'
import type { EffectiveLearningOptimizer } from './learning-optimizer-catalog'
import type {
  LearningNoteSummary,
  LearningTarget,
  ReconcileLearningCardsInput,
} from './types'
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm'
import { learningCards, learningNoteOptimizerAssignments, learningOptimizers, learningTargets, notes } from '../drizzle-schema'
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

interface LearningNoteCardRow {
  note_id: string
  note_title: string
  optimizer_id: string
  optimizer_is_global: number
  optimizer_name: string
  optimizer_status: 'active' | 'archived'
  topic_id: string
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
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #effectiveOptimizer: LearningCardRepositoryDependencies['effectiveOptimizer']
  readonly #runOperation: StorageOperationRunner

  constructor(dependencies: LearningCardRepositoryDependencies) {
    this.#database = dependencies.database
    this.#orm = dependencies.database.drizzle
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
      const rows = this.#orm.select({
        target_id: learningTargets.targetId,
        card_id: learningTargets.cardId,
        target_kind: learningTargets.targetKind,
        target_order: learningTargets.targetOrder,
        item_block_id: learningTargets.itemBlockId,
        active: learningTargets.active,
        partial_active: learningTargets.partialActive,
        created_at: learningTargets.createdAt,
        card_active: learningCards.active,
        note_id: learningCards.noteId,
        topic_id: learningCards.topicId,
        topic_order: learningCards.topicOrder,
        source_block_id: learningCards.sourceBlockId,
        source_order: learningCards.sourceOrder,
        kind: learningCards.kind,
        direction: learningCards.direction,
      }).from(learningTargets).innerJoin(learningCards, eq(learningCards.cardId, learningTargets.cardId)).where(eq(learningTargets.cardId, cardIdValue)).orderBy(asc(learningTargets.targetOrder), asc(learningTargets.targetId)).all() as TargetRow[]
      return rows.map(toLearningTarget)
    })
  }

  listNoteTopicIds(noteId: string): Promise<readonly string[]> {
    assertNonEmpty(noteId, 'Note id')
    return this.#runOperation(async () => {
      const rows = this.#orm.selectDistinct({ topic_id: learningCards.topicId }).from(learningCards).where(eq(learningCards.noteId, noteId)).orderBy(asc(learningCards.topicId)).all()
      return rows.map(row => row.topic_id)
    })
  }

  listNotesWithCards(): Promise<readonly LearningNoteSummary[]> {
    return this.#runOperation(async () => {
      const rows = this.#orm.select({
        note_id: notes.id,
        note_title: notes.title,
        updated_at: notes.updatedAt,
        optimizer_id: learningOptimizers.optimizerId,
        optimizer_name: learningOptimizers.name,
        optimizer_is_global: learningOptimizers.isGlobal,
        optimizer_status: learningOptimizers.status,
        topic_id: learningCards.topicId,
      }).from(learningCards).innerJoin(notes, eq(notes.id, learningCards.noteId)).leftJoin(learningNoteOptimizerAssignments, eq(learningNoteOptimizerAssignments.noteId, notes.id)).innerJoin(learningOptimizers, or(
        eq(learningOptimizers.optimizerId, learningNoteOptimizerAssignments.optimizerId),
        and(isNull(learningNoteOptimizerAssignments.optimizerId), eq(learningOptimizers.optimizerId, GLOBAL_OPTIMIZER_ID)),
      )).where(eq(learningCards.active, 1)).orderBy(desc(notes.updatedAt), desc(notes.id)).all() as LearningNoteCardRow[]
      const summaries = new Map<string, LearningNoteSummary & { topicIds: Set<string> }>()
      for (const row of rows) {
        if (row.optimizer_status !== 'active')
          throw new Error(`Note ${row.note_id} references archived FSRS Optimizer ${row.optimizer_id}`)
        const existing = summaries.get(row.note_id)
        if (existing) {
          existing.cardCount += 1
          existing.topicIds.add(row.topic_id)
          existing.topicCount = existing.topicIds.size
          continue
        }
        summaries.set(row.note_id, {
          cardCount: 1,
          noteId: row.note_id,
          noteTitle: row.note_title,
          optimizer: {
            id: row.optimizer_id,
            isGlobal: row.optimizer_is_global === 1,
            name: row.optimizer_name,
          },
          topicCount: 1,
          topicIds: new Set([row.topic_id]),
          updatedAt: row.updated_at,
        })
      }
      return [...summaries.values()].map(({ topicIds: _topicIds, ...summary }) => summary)
    })
  }
}
