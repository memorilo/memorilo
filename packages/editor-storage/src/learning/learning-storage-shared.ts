import type {
  FsrsOptimizerConfiguration,
  PersistedLearningState,
} from '@memorilo/srs'
import type { DatabaseCommand } from '../database-driver'
import type { LearningState, LearningSyncChange } from './types'
import { validateOptimizerConfiguration } from '@memorilo/srs'
import { v7 as createUuidV7 } from 'uuid'

export { assertNonEmpty } from '../editor-storage-shared'

export interface LearningStateRow {
  difficulty: number
  due_at: number
  lapses: number
  last_review_at: number | null
  learning_steps: number
  optimizer_revision_id: string
  phase: 'learning' | 'new' | 'relearning' | 'review'
  reps: number
  scheduled_days: number
  stability: number
  state_hash: string
  target_id: string
  winning_event_id: string | null
}

export function assertTimestamp(value: number, description: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${description} must be a non-negative safe integer timestamp`)
}

export function parseOptimizerConfiguration(json: string): FsrsOptimizerConfiguration {
  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== 'object')
    throw new TypeError('Stored FSRS Optimizer configuration must be an object')
  return validateOptimizerConfiguration(parsed as FsrsOptimizerConfiguration)
}

export function syncMutationCommand(
  entityKind: LearningSyncChange['entityKind'],
  entityId: string,
  operation: LearningSyncChange['operation'],
  payload: unknown,
  createdAt: number,
): DatabaseCommand {
  return {
    parameters: [
      createUuidV7(),
      entityKind,
      entityId,
      operation,
      JSON.stringify(payload),
      createdAt,
    ],
    sql: 'INSERT INTO learning_sync_outbox (mutation_id, entity_kind, entity_id, operation, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  }
}

const learningStateInsertSql = 'INSERT INTO learning_states (target_id, phase, due_at, stability, difficulty, scheduled_days, learning_steps, reps, lapses, last_review_at, optimizer_revision_id, winning_event_id, state_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(target_id)'

export function stateCommand(
  state: PersistedLearningState,
  conflictBehavior: 'ignore' | 'update' = 'update',
): DatabaseCommand {
  return {
    parameters: [
      state.targetId,
      state.phase,
      state.dueAt,
      state.stability,
      state.difficulty,
      state.scheduledDays,
      state.learningSteps,
      state.reps,
      state.lapses,
      state.lastReviewAt,
      state.optimizerRevisionId,
      state.winningEventId,
      state.stateHash,
    ],
    sql: `${learningStateInsertSql} ${conflictBehavior === 'update'
      ? 'DO UPDATE SET phase = excluded.phase, due_at = excluded.due_at, stability = excluded.stability, difficulty = excluded.difficulty, scheduled_days = excluded.scheduled_days, learning_steps = excluded.learning_steps, reps = excluded.reps, lapses = excluded.lapses, last_review_at = excluded.last_review_at, optimizer_revision_id = excluded.optimizer_revision_id, winning_event_id = excluded.winning_event_id, state_hash = excluded.state_hash'
      : 'DO NOTHING'}`,
  }
}

export function toLearningState(state: LearningStateRow | PersistedLearningState): LearningState {
  return {
    difficulty: state.difficulty,
    dueAt: 'dueAt' in state ? state.dueAt : state.due_at,
    lapses: state.lapses,
    lastReviewAt: 'lastReviewAt' in state ? state.lastReviewAt : state.last_review_at,
    learningSteps: 'learningSteps' in state ? state.learningSteps : state.learning_steps,
    optimizerRevisionId: 'optimizerRevisionId' in state
      ? state.optimizerRevisionId
      : state.optimizer_revision_id,
    phase: state.phase,
    reps: state.reps,
    scheduledDays: 'scheduledDays' in state ? state.scheduledDays : state.scheduled_days,
    stability: state.stability,
    targetId: 'targetId' in state ? state.targetId : state.target_id,
    winningEventId: 'winningEventId' in state ? state.winningEventId : state.winning_event_id,
  }
}
