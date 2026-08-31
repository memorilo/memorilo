import type {
  FsrsOptimizerConfiguration,
  PersistedLearningState,
} from '@memorilo/srs'
import type { DatabaseCommand } from '../database-driver'
import type { LearningState, LearningSyncChange } from './types'
import { validateOptimizerConfiguration } from '@memorilo/srs'
import { v7 as createUuidV7 } from 'uuid'
import { learningStates, learningSyncOutbox } from '../drizzle-schema'

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
  const mutationId = createUuidV7()
  const payloadJson = JSON.stringify(payload)
  return {
    drizzle: database => database.insert(learningSyncOutbox).values({
      createdAt,
      entityId,
      entityKind,
      mutationId,
      operation,
      payloadJson,
    }).run(),
  }
}

export function stateCommand(
  state: PersistedLearningState,
  conflictBehavior: 'ignore' | 'update' = 'update',
): DatabaseCommand {
  const values = {
    difficulty: state.difficulty,
    dueAt: state.dueAt,
    lapses: state.lapses,
    lastReviewAt: state.lastReviewAt,
    learningSteps: state.learningSteps,
    optimizerRevisionId: state.optimizerRevisionId,
    phase: state.phase,
    reps: state.reps,
    scheduledDays: state.scheduledDays,
    stability: state.stability,
    stateHash: state.stateHash,
    targetId: state.targetId,
    winningEventId: state.winningEventId,
  }
  return {
    drizzle: (database) => {
      const insert = database.insert(learningStates).values(values)
      if (conflictBehavior === 'ignore') {
        insert.onConflictDoNothing().run()
        return
      }
      insert.onConflictDoUpdate({
        set: values,
        target: learningStates.targetId,
      }).run()
    },
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
