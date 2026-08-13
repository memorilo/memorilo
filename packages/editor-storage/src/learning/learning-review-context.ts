import type { EditorStorageDatabase } from '../database-driver'
import type { LearningReviewHistory, LearningReviewOptimizer } from './learning-review-history'
import type { LearningStateRow } from './learning-storage-shared'

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
  readonly history: LearningReviewHistory
  readonly resolveOptimizer: (noteId: string) => Promise<LearningReviewOptimizer>

  constructor(options: {
    database: EditorStorageDatabase
    history: LearningReviewHistory
    resolveOptimizer: (noteId: string) => Promise<LearningReviewOptimizer>
  }) {
    this.database = options.database
    this.history = options.history
    this.resolveOptimizer = options.resolveOptimizer
  }

  async stateRow(targetId: string): Promise<LearningStateRow> {
    const row = await this.database.get<LearningStateRow>(
      'SELECT target_id, phase, due_at, stability, difficulty, scheduled_days, learning_steps, reps, lapses, last_review_at, optimizer_revision_id, winning_event_id, state_hash FROM learning_states WHERE target_id = ?',
      [targetId],
    )
    if (!row)
      throw new Error(`Review Target ${targetId} has no Learning State`)
    return row
  }

  async syncState(): Promise<SyncStateRow> {
    const row = await this.database.get<SyncStateRow>(
      'SELECT device_id, next_device_sequence FROM learning_sync_state WHERE singleton = 1',
    )
    if (!row)
      throw new Error('Learning sync state is missing')
    return row
  }

  async targetRow(targetId: string): Promise<ReviewTargetRow> {
    const row = await this.database.get<ReviewTargetRow>(
      'SELECT t.target_id, t.card_id, t.target_kind, t.target_order, t.active, t.created_at, c.active AS card_active, c.note_id, c.source_block_id, c.kind, c.direction FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id WHERE t.target_id = ?',
      [targetId],
    )
    if (!row)
      throw new Error(`Unknown Review Target: ${targetId}`)
    if (row.active !== 1 || row.card_active !== 1)
      throw new Error(`Review Target ${targetId} is inactive`)
    return row
  }
}
