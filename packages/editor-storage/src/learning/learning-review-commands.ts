import type { DatabaseCommand } from '../database-driver'
import type { LearningReviewContext, SyncStateRow } from './learning-review-context'
import type { ReviewEventRow } from './learning-review-history'
import type {
  LearningState,
  ResetLearningTargetInput,
  UndoLearningReviewInput,
  UndoLearningReviewsInput,
} from './types'
import { emptyLearningState, FSRSVersion } from '@memorilo/srs'
import { v7 as createUuidV7 } from 'uuid'
import { itemPartialActive } from './learning-review-history'
import {
  assertNonEmpty,
  assertTimestamp,
  stateCommand,
  syncMutationCommand,
  toLearningState,
} from './learning-storage-shared'

interface NormalizedUndoCommand {
  eventId: string
  expectedReviewEventId?: string
  targetId: string
}

interface UndoMutation {
  cardId: string
  commands: readonly DatabaseCommand[]
  state: LearningState
}

export class LearningReviewCommands {
  readonly #context: LearningReviewContext

  constructor(context: LearningReviewContext) {
    this.#context = context
  }

  async resetTarget(input: ResetLearningTargetInput): Promise<LearningState> {
    assertNonEmpty(input.targetId, 'Review Target id')
    const resetAt = input.resetAt ?? Date.now()
    assertTimestamp(resetAt, 'Reset time')
    const eventId = input.eventId ?? createUuidV7()
    assertNonEmpty(eventId, 'Reset Event id')
    const existing = await this.#context.database.get<{
      event_kind: ReviewEventRow['event_kind']
      occurred_at: number
      target_id: string
    }>(
      'SELECT target_id, event_kind, occurred_at FROM learning_review_events WHERE event_id = ?',
      [eventId],
    )
    if (existing) {
      if (existing.event_kind !== 'reset'
        || existing.target_id !== input.targetId
        || (input.resetAt !== undefined && existing.occurred_at !== resetAt)) {
        throw new Error(`Reset Event ${eventId} was retried with different data`)
      }
      return toLearningState(await this.#context.stateRow(input.targetId))
    }
    const target = await this.#context.targetRow(input.targetId)
    const optimizer = await this.#context.resolveOptimizer(target.note_id)
    const sync = await this.#context.syncState()
    const state = emptyLearningState(target.target_id, resetAt, optimizer.revisionId)
    await this.#context.database.batch([
      {
        parameters: [
          eventId,
          target.target_id,
          target.card_id,
          target.note_id,
          resetAt,
          eventId,
          sync.device_id,
          sync.next_device_sequence,
          FSRSVersion,
        ],
        sql: 'INSERT INTO learning_review_events (event_id, target_id, card_id, note_id, event_kind, occurred_at, reset_epoch, device_id, device_sequence, fsrs_version) VALUES (?, ?, ?, ?, \'reset\', ?, ?, ?, ?, ?)',
      },
      {
        parameters: [sync.next_device_sequence + 1],
        sql: 'UPDATE learning_sync_state SET next_device_sequence = ? WHERE singleton = 1',
      },
      stateCommand(state),
      {
        parameters: [target.target_id],
        sql: 'UPDATE learning_targets SET partial_active = 0 WHERE target_id = ?',
      },
      syncMutationCommand('review-event', eventId, 'upsert', {
        eventId,
        kind: 'reset',
        resetAt,
        resultState: toLearningState(state),
        targetId: target.target_id,
      }, resetAt),
    ])
    return toLearningState(state)
  }

  async #existingUndo(
    command: NormalizedUndoCommand,
    expectedUndoneAt: number | undefined,
  ): Promise<LearningState | null> {
    const existing = await this.#context.database.get<{
      event_kind: ReviewEventRow['event_kind']
      occurred_at: number
      target_id: string
      undoes_event_id: string | null
    }>(
      'SELECT target_id, event_kind, occurred_at, undoes_event_id FROM learning_review_events WHERE event_id = ?',
      [command.eventId],
    )
    if (!existing)
      return null
    if (existing.event_kind !== 'undo'
      || existing.target_id !== command.targetId
      || (command.expectedReviewEventId !== undefined
        && existing.undoes_event_id !== command.expectedReviewEventId)
      || (expectedUndoneAt !== undefined && existing.occurred_at !== expectedUndoneAt)) {
      throw new Error(`Undo Event ${command.eventId} was retried with different data`)
    }
    return toLearningState(await this.#context.stateRow(command.targetId))
  }

  async #undoMutation(
    command: NormalizedUndoCommand,
    undoneAt: number,
    sync: SyncStateRow,
    deviceSequence: number,
  ): Promise<UndoMutation> {
    const target = await this.#context.targetRow(command.targetId)
    const optimizer = await this.#context.resolveOptimizer(target.note_id)
    const current = await this.#context.stateRow(command.targetId)
    if (current.winning_event_id === null)
      throw new Error(`Review Target ${command.targetId} has no Rating to undo`)
    if (command.expectedReviewEventId !== undefined
      && command.expectedReviewEventId !== current.winning_event_id) {
      throw new Error(`Review Target ${command.targetId} no longer has the expected Rating to undo`)
    }
    const winningEventId = current.winning_event_id
    const undoEvent: ReviewEventRow = {
      base_event_id: winningEventId,
      event_id: command.eventId,
      event_kind: 'undo',
      occurred_at: undoneAt,
      rating: null,
      reset_epoch: null,
      undoes_event_id: winningEventId,
    }
    const replayed = await this.#context.history.replayState({
      createdAt: target.created_at,
      targetId: target.target_id,
    }, optimizer, [undoEvent])
    const partialActive = target.target_kind === 'item' && itemPartialActive(replayed.canonical)
    return {
      cardId: target.card_id,
      commands: [
        {
          parameters: [
            command.eventId,
            target.target_id,
            target.card_id,
            target.note_id,
            undoneAt,
            winningEventId,
            winningEventId,
            sync.device_id,
            deviceSequence,
            FSRSVersion,
          ],
          sql: 'INSERT INTO learning_review_events (event_id, target_id, card_id, note_id, event_kind, occurred_at, base_event_id, undoes_event_id, device_id, device_sequence, fsrs_version) VALUES (?, ?, ?, ?, \'undo\', ?, ?, ?, ?, ?, ?)',
        },
        stateCommand(replayed.state),
        {
          parameters: [partialActive ? 1 : 0, target.target_id],
          sql: 'UPDATE learning_targets SET partial_active = ? WHERE target_id = ?',
        },
        {
          parameters: [winningEventId],
          sql: 'DELETE FROM learning_queue_exclusions WHERE source_event_id = ?',
        },
        syncMutationCommand('review-event', command.eventId, 'upsert', {
          eventId: command.eventId,
          kind: 'undo',
          resultState: toLearningState(replayed.state),
          targetId: target.target_id,
          undoesEventId: winningEventId,
          undoneAt,
        }, undoneAt),
      ],
      state: toLearningState(replayed.state),
    }
  }

  async #undoBatch(
    commands: readonly NormalizedUndoCommand[],
    undoneAt: number,
    expectedUndoneAt: number | undefined,
  ): Promise<readonly LearningState[]> {
    const existing = await Promise.all(commands.map(command => (
      this.#existingUndo(command, expectedUndoneAt)
    )))
    const committed = existing.filter((state): state is LearningState => state !== null)
    if (committed.length === commands.length)
      return committed
    if (committed.length > 0)
      throw new Error('Review Undo batch was only partially committed')

    const sync = await this.#context.syncState()
    const mutations: UndoMutation[] = []
    for (const [index, command] of commands.entries()) {
      mutations.push(await this.#undoMutation(
        command,
        undoneAt,
        sync,
        sync.next_device_sequence + index,
      ))
    }
    const cardIds = [...new Set(mutations.map(mutation => mutation.cardId))]
    await this.#context.database.batch([
      ...mutations.flatMap(mutation => mutation.commands),
      {
        parameters: [sync.next_device_sequence + mutations.length],
        sql: 'UPDATE learning_sync_state SET next_device_sequence = ? WHERE singleton = 1',
      },
      ...cardIds.flatMap<DatabaseCommand>(cardId => [
        {
          parameters: [cardId, cardId],
          sql: 'INSERT INTO learning_card_introductions (card_id, introduced_at) SELECT ?, MIN(e.occurred_at) FROM learning_review_events e WHERE e.card_id = ? AND e.event_kind = \'rating\' AND NOT EXISTS (SELECT 1 FROM learning_review_events u WHERE u.event_kind = \'undo\' AND u.undoes_event_id = e.event_id) HAVING COUNT(*) > 0 ON CONFLICT(card_id) DO UPDATE SET introduced_at = excluded.introduced_at',
        },
        {
          parameters: [cardId, cardId],
          sql: 'DELETE FROM learning_card_introductions WHERE card_id = ? AND NOT EXISTS (SELECT 1 FROM learning_review_events e WHERE e.card_id = ? AND e.event_kind = \'rating\' AND NOT EXISTS (SELECT 1 FROM learning_review_events u WHERE u.event_kind = \'undo\' AND u.undoes_event_id = e.event_id))',
        },
      ]),
    ])
    return mutations.map(mutation => mutation.state)
  }

  async undoLastReview(input: UndoLearningReviewInput): Promise<LearningState> {
    assertNonEmpty(input.targetId, 'Review Target id')
    if (input.expectedReviewEventId !== undefined)
      assertNonEmpty(input.expectedReviewEventId, 'Expected Review Event id')
    const undoneAt = input.undoneAt ?? Date.now()
    assertTimestamp(undoneAt, 'Undo time')
    const command = {
      eventId: input.eventId ?? createUuidV7(),
      expectedReviewEventId: input.expectedReviewEventId,
      targetId: input.targetId,
    }
    assertNonEmpty(command.eventId, 'Undo Event id')
    const states = await this.#undoBatch([command], undoneAt, input.undoneAt)
    const state = states[0]
    if (!state)
      throw new Error('Undo did not produce a Learning State')
    return state
  }

  async undoReviews(
    input: UndoLearningReviewsInput,
  ): Promise<readonly LearningState[]> {
    if (input.reviews.length === 0)
      throw new TypeError('A Review Undo batch requires at least one Review Event')
    for (const review of input.reviews) {
      assertNonEmpty(review.targetId, 'Review Target id')
      assertNonEmpty(review.expectedReviewEventId, 'Expected Review Event id')
      assertNonEmpty(review.eventId, 'Undo Event id')
    }
    const targetIds = input.reviews.map(review => review.targetId)
    if (new Set(targetIds).size !== targetIds.length)
      throw new Error('A Review Undo batch cannot contain duplicate Review Targets')
    const eventIds = input.reviews.map(review => review.eventId)
    if (new Set(eventIds).size !== eventIds.length)
      throw new Error('A Review Undo batch cannot contain duplicate Undo Event ids')
    const undoneAt = input.undoneAt ?? Date.now()
    assertTimestamp(undoneAt, 'Undo time')
    return this.#undoBatch(input.reviews, undoneAt, input.undoneAt)
  }
}
