import type { EditorStorageDatabase, EditorStorageDrizzleDatabase } from '../database-driver'
import type { LearningReviewHistory, LearningReviewOptimizer } from './learning-review-history'
import type { LearningStateRow } from './learning-storage-shared'
import { eq } from 'drizzle-orm'
import { learningCards, learningStates, learningSyncState as learningSyncStateTable, learningTargets } from '../drizzle-schema'

export interface ReviewTargetRow {
  active: number
  card_active: number
  card_id: string
  created_at: number
  direction: 'backward' | 'forward'
  kind: 'basic' | 'cloze' | 'list' | 'set'
  note_id: string
  source_block_id: string
  target_id: string
  target_kind: 'item' | 'whole'
  target_order: number
}

export interface SyncStateRow {
  device_id: string
  next_device_sequence: number
}

export class LearningReviewContext {
  readonly database: EditorStorageDatabase
  readonly #orm: EditorStorageDrizzleDatabase
  readonly history: LearningReviewHistory
  readonly resolveOptimizer: (noteId: string) => Promise<LearningReviewOptimizer>

  constructor(options: {
    database: EditorStorageDatabase
    history: LearningReviewHistory
    resolveOptimizer: (noteId: string) => Promise<LearningReviewOptimizer>
  }) {
    this.database = options.database
    this.#orm = options.database.drizzle
    this.history = options.history
    this.resolveOptimizer = options.resolveOptimizer
  }

  async stateRow(targetId: string): Promise<LearningStateRow> {
    const row = this.#orm.select({
      target_id: learningStates.targetId,
      phase: learningStates.phase,
      due_at: learningStates.dueAt,
      stability: learningStates.stability,
      difficulty: learningStates.difficulty,
      scheduled_days: learningStates.scheduledDays,
      learning_steps: learningStates.learningSteps,
      reps: learningStates.reps,
      lapses: learningStates.lapses,
      last_review_at: learningStates.lastReviewAt,
      optimizer_revision_id: learningStates.optimizerRevisionId,
      winning_event_id: learningStates.winningEventId,
      state_hash: learningStates.stateHash,
    }).from(learningStates).where(eq(learningStates.targetId, targetId)).get() as LearningStateRow | undefined
    if (!row)
      throw new Error(`Review Target ${targetId} has no Learning State`)
    return row
  }

  async syncState(): Promise<SyncStateRow> {
    const row = this.#orm.select({ device_id: learningSyncStateTable.deviceId, next_device_sequence: learningSyncStateTable.nextDeviceSequence })
      .from(learningSyncStateTable)
      .where(eq(learningSyncStateTable.singleton, 1))
      .get() as SyncStateRow | undefined
    if (!row)
      throw new Error('Learning sync state is missing')
    return row
  }

  async targetRow(targetId: string): Promise<ReviewTargetRow> {
    const row = this.#orm.select({
      target_id: learningTargets.targetId,
      card_id: learningTargets.cardId,
      target_kind: learningTargets.targetKind,
      target_order: learningTargets.targetOrder,
      active: learningTargets.active,
      created_at: learningTargets.createdAt,
      card_active: learningCards.active,
      note_id: learningCards.noteId,
      source_block_id: learningCards.sourceBlockId,
      kind: learningCards.kind,
      direction: learningCards.direction,
    }).from(learningTargets).innerJoin(learningCards, eq(learningCards.cardId, learningTargets.cardId)).where(eq(learningTargets.targetId, targetId)).get() as ReviewTargetRow | undefined
    if (!row)
      throw new Error(`Unknown Review Target: ${targetId}`)
    if (row.active !== 1 || row.card_active !== 1)
      throw new Error(`Review Target ${targetId} is inactive`)
    return row
  }

  activeTargets(cardId: string): readonly ReviewTargetRow[] {
    return this.#orm.select({
      target_id: learningTargets.targetId,
      card_id: learningTargets.cardId,
      target_kind: learningTargets.targetKind,
      target_order: learningTargets.targetOrder,
      active: learningTargets.active,
      created_at: learningTargets.createdAt,
      card_active: learningCards.active,
      note_id: learningCards.noteId,
      source_block_id: learningCards.sourceBlockId,
      kind: learningCards.kind,
      direction: learningCards.direction,
    }).from(learningTargets).innerJoin(learningCards, eq(learningCards.cardId, learningTargets.cardId)).where(eq(learningTargets.cardId, cardId)).orderBy(learningTargets.targetOrder, learningTargets.targetId).all() as ReviewTargetRow[]
  }
}
