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
import { and, eq } from 'drizzle-orm'
import { v7 as createUuidV7 } from 'uuid'
import {
  learningCardIntroductions,
  learningQueueExclusions,
  learningReviewEvents,
  learningSyncState,
  learningTargets,
} from '../drizzle-schema'
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

function refreshIntroductionCommand(cardId: string): DatabaseCommand {
  return {
    drizzle: (database) => {
      const events = database.select({ eventId: learningReviewEvents.eventId, occurredAt: learningReviewEvents.occurredAt })
        .from(learningReviewEvents)
        .where(and(eq(learningReviewEvents.cardId, cardId), eq(learningReviewEvents.eventKind, 'rating')))
        .all()
      const undone = new Set(database.select({ eventId: learningReviewEvents.undoesEventId })
        .from(learningReviewEvents)
        .where(eq(learningReviewEvents.eventKind, 'undo'))
        .all()
        .flatMap(row => row.eventId === null ? [] : [row.eventId]))
      const introducedAt = events.filter(event => !undone.has(event.eventId))
        .reduce<number | null>((minimum, event) => minimum === null ? event.occurredAt : Math.min(minimum, event.occurredAt), null)
      if (introducedAt === null) {
        database.delete(learningCardIntroductions)
          .where(eq(learningCardIntroductions.cardId, cardId))
          .run()
        return
      }
      database.insert(learningCardIntroductions).values({ cardId, introducedAt }).onConflictDoUpdate({ set: { introducedAt }, target: learningCardIntroductions.cardId }).run()
    },
  }
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
    const existing = this.#context.history.eventById(eventId)
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
        drizzle: database => database.insert(learningReviewEvents).values({
          cardId: target.card_id,
          deviceId: sync.device_id,
          deviceSequence: sync.next_device_sequence,
          eventId,
          eventKind: 'reset',
          fsrsVersion: FSRSVersion,
          noteId: target.note_id,
          occurredAt: resetAt,
          resetEpoch: eventId,
          targetId: target.target_id,
        }).run(),
      },
      {
        drizzle: database => database.update(learningSyncState)
          .set({ nextDeviceSequence: sync.next_device_sequence + 1 })
          .where(eq(learningSyncState.singleton, 1))
          .run(),
      },
      stateCommand(state),
      {
        drizzle: database => database.update(learningTargets).set({ partialActive: 0 }).where(eq(learningTargets.targetId, target.target_id)).run(),
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
    const existing = this.#context.history.eventById(command.eventId)
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
          drizzle: database => database.insert(learningReviewEvents).values({
            baseEventId: winningEventId,
            cardId: target.card_id,
            deviceId: sync.device_id,
            deviceSequence,
            eventId: command.eventId,
            eventKind: 'undo',
            fsrsVersion: FSRSVersion,
            noteId: target.note_id,
            occurredAt: undoneAt,
            targetId: target.target_id,
            undoesEventId: winningEventId,
          }).run(),
        },
        stateCommand(replayed.state),
        {
          drizzle: database => database.update(learningTargets)
            .set({ partialActive: partialActive ? 1 : 0 })
            .where(eq(learningTargets.targetId, target.target_id))
            .run(),
        },
        {
          drizzle: database => database.delete(learningQueueExclusions)
            .where(eq(learningQueueExclusions.sourceEventId, winningEventId))
            .run(),
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
        drizzle: database => database.update(learningSyncState)
          .set({ nextDeviceSequence: sync.next_device_sequence + mutations.length })
          .where(eq(learningSyncState.singleton, 1))
          .run(),
      },
      ...cardIds.map(refreshIntroductionCommand),
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
