import type { LearningQueueKind } from '@memorilo/srs'
import type { DatabaseCommand } from '../database-driver'
import type { LearningReviewContext, ReviewTargetRow, SyncStateRow } from './learning-review-context'
import type { ReviewEventRow } from './learning-review-history'
import type {
  LearningRatingOutcome,
  LearningReviewPreparationToken,
  MultiLineReviewResult,
  PreparedLearningReview,
  PrepareLearningReviewInput,
  RateLearningTargetInput,
  RateMultiLineCardInput,
  ReviewRating,
  ReviewResult,
} from './types'
import {
  aggregateMultiLineRating,
  FSRSVersion,
  queueKindForState,
  replayRatings,
} from '@memorilo/srs'
import { v7 as createUuidV7 } from 'uuid'
import { canonicalRatings, itemPartialActive } from './learning-review-history'
import {
  assertNonEmpty,
  assertTimestamp,
  stateCommand,
  syncMutationCommand,
  toLearningState,
} from './learning-storage-shared'

interface NormalizedRatingInput {
  eventId: string
  hasExpectedWinningEvent: boolean
  input: RateLearningTargetInput
  reviewedAt: number
}

interface RatingMutation {
  commands: readonly DatabaseCommand[]
  result: ReviewResult
}

function assertReviewRating(rating: ReviewRating): void {
  if (!['again', 'hard', 'good', 'easy'].includes(rating))
    throw new TypeError(`Unsupported Rating: ${String(rating)}`)
}

function normalizeRatingInput(input: RateLearningTargetInput): NormalizedRatingInput {
  assertNonEmpty(input.targetId, 'Review Target id')
  assertReviewRating(input.rating)
  const hasExpectedWinningEvent = Object.hasOwn(input, 'expectedWinningEventId')
  const usesPreparedReview = hasExpectedWinningEvent
    || input.expectedOptimizerRevisionId !== undefined
    || input.expectedStateHash !== undefined
  if (usesPreparedReview
    && (input.eventId === undefined
      || input.reviewedAt === undefined
      || input.expectedOptimizerRevisionId === undefined
      || input.expectedStateHash === undefined
      || !hasExpectedWinningEvent)) {
    throw new TypeError('A prepared Review must include its complete preparation token')
  }
  const reviewedAt = input.reviewedAt ?? Date.now()
  assertTimestamp(reviewedAt, 'Review time')
  if (input.responseMilliseconds !== undefined
    && (!Number.isSafeInteger(input.responseMilliseconds) || input.responseMilliseconds < 0)) {
    throw new RangeError('Response time must be a non-negative safe integer')
  }
  const eventId = input.eventId ?? createUuidV7()
  assertNonEmpty(eventId, 'Review Event id')
  return { eventId, hasExpectedWinningEvent, input, reviewedAt }
}

function preparedRating(
  preparation: LearningReviewPreparationToken,
  rating: ReviewRating,
  responseMilliseconds: number | undefined,
): RateLearningTargetInput {
  return {
    ...preparation,
    rating,
    ...(responseMilliseconds === undefined ? {} : { responseMilliseconds }),
  }
}

export class LearningRatingCommands {
  readonly #context: LearningReviewContext

  constructor(context: LearningReviewContext) {
    this.#context = context
  }

  async prepareReview(
    input: PrepareLearningReviewInput,
  ): Promise<PreparedLearningReview> {
    assertNonEmpty(input.targetId, 'Review Target id')
    if (input.reviewedAt !== undefined)
      assertTimestamp(input.reviewedAt, 'Review time')

    const reviewedAt = input.reviewedAt ?? Date.now()
    const eventId = createUuidV7()
    const target = await this.#context.targetRow(input.targetId)
    const optimizer = await this.#context.resolveOptimizer(target.note_id)
    const currentState = await this.#context.stateRow(input.targetId)
    const events = await this.#context.history.events(input.targetId)
    const outcome = (rating: ReviewRating): LearningRatingOutcome => {
      const previewEvent: ReviewEventRow = {
        base_event_id: currentState.winning_event_id,
        event_id: eventId,
        event_kind: 'rating',
        occurred_at: reviewedAt,
        rating,
        reset_epoch: null,
        undoes_event_id: null,
      }
      const state = replayRatings(
        target.target_id,
        target.created_at,
        optimizer.revisionId,
        optimizer.configuration,
        canonicalRatings([...events, previewEvent]),
      )
      return {
        intervalMilliseconds: Math.max(0, state.dueAt - reviewedAt),
        state: toLearningState(state),
      }
    }

    return {
      eventId,
      expectedOptimizerRevisionId: optimizer.revisionId,
      expectedStateHash: currentState.state_hash,
      expectedWinningEventId: currentState.winning_event_id,
      outcomes: {
        again: outcome('again'),
        easy: outcome('easy'),
        good: outcome('good'),
        hard: outcome('hard'),
      },
      reviewedAt,
      targetId: target.target_id,
    }
  }

  async #existingRating(
    normalized: NormalizedRatingInput,
  ): Promise<ReviewResult | null> {
    const { eventId, input, reviewedAt } = normalized
    const existing = await this.#context.database.get<{
      event_kind: ReviewEventRow['event_kind']
      occurred_at: number
      rating: ReviewRating | null
      response_milliseconds: number | null
      target_id: string
    }>(
      'SELECT target_id, event_kind, rating, occurred_at, response_milliseconds FROM learning_review_events WHERE event_id = ?',
      [eventId],
    )
    if (!existing)
      return null
    if (existing.event_kind !== 'rating'
      || existing.target_id !== input.targetId
      || existing.rating !== input.rating
      || (input.reviewedAt !== undefined && existing.occurred_at !== reviewedAt)
      || existing.response_milliseconds !== (input.responseMilliseconds ?? null)) {
      throw new Error(`Review Event ${eventId} was retried with different data`)
    }
    return { eventId, state: toLearningState(await this.#context.stateRow(input.targetId)) }
  }

  async #ratingMutation(
    normalized: NormalizedRatingInput,
    sync: SyncStateRow,
    deviceSequence: number,
  ): Promise<RatingMutation> {
    const { eventId, hasExpectedWinningEvent, input, reviewedAt } = normalized
    const target = await this.#context.targetRow(input.targetId)
    const optimizer = await this.#context.resolveOptimizer(target.note_id)
    const currentState = await this.#context.stateRow(input.targetId)
    if (input.expectedStateHash !== undefined && input.expectedStateHash !== currentState.state_hash)
      throw new Error(`Review preparation for Target ${input.targetId} uses a stale Learning State`)
    if (hasExpectedWinningEvent
      && input.expectedWinningEventId !== currentState.winning_event_id) {
      throw new Error(`Review preparation for Target ${input.targetId} is stale`)
    }
    if (input.expectedOptimizerRevisionId !== undefined
      && input.expectedOptimizerRevisionId !== optimizer.revisionId) {
      throw new Error(`Review preparation for Target ${input.targetId} uses a stale Optimizer revision`)
    }
    const sourceQueue = queueKindForState({
      phase: currentState.phase,
      scheduledDays: currentState.scheduled_days,
    })
    const event: ReviewEventRow = {
      base_event_id: currentState.winning_event_id,
      event_id: eventId,
      event_kind: 'rating',
      occurred_at: reviewedAt,
      rating: input.rating,
      reset_epoch: null,
      undoes_event_id: null,
    }
    const replayed = await this.#context.history.replayState({
      createdAt: target.created_at,
      targetId: target.target_id,
    }, optimizer, [event])
    const partialActive = target.target_kind === 'item' && itemPartialActive(replayed.canonical)
    return {
      commands: [
        {
          parameters: [target.card_id, reviewedAt],
          sql: 'INSERT INTO learning_card_introductions (card_id, introduced_at) VALUES (?, ?) ON CONFLICT(card_id) DO UPDATE SET introduced_at = MIN(learning_card_introductions.introduced_at, excluded.introduced_at)',
        },
        {
          parameters: [
            eventId,
            target.target_id,
            target.card_id,
            target.note_id,
            input.rating,
            reviewedAt,
            input.responseMilliseconds ?? null,
            currentState.scheduled_days,
            currentState.last_review_at === null
              ? 0
              : Math.max(0, Math.round((reviewedAt - currentState.last_review_at) / 86_400_000)),
            currentState.winning_event_id,
            JSON.stringify(toLearningState(replayed.state)),
            sync.device_id,
            deviceSequence,
            FSRSVersion,
          ],
          sql: 'INSERT INTO learning_review_events (event_id, target_id, card_id, note_id, event_kind, rating, occurred_at, response_milliseconds, scheduled_days, elapsed_days, base_event_id, result_state_json, device_id, device_sequence, fsrs_version) VALUES (?, ?, ?, ?, \'rating\', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        },
        {
          parameters: [
            eventId,
            target.card_id,
            target.note_id,
            target.source_block_id,
            sourceQueue,
            reviewedAt,
          ],
          sql: 'INSERT INTO learning_sibling_bury_events (source_event_id, source_card_id, note_id, source_block_id, source_queue, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
        },
        stateCommand(replayed.state),
        {
          parameters: [partialActive ? 1 : 0, target.target_id],
          sql: 'UPDATE learning_targets SET partial_active = ? WHERE target_id = ?',
        },
        syncMutationCommand('review-event', eventId, 'upsert', {
          baseEventId: currentState.winning_event_id,
          cardId: target.card_id,
          eventId,
          kind: 'rating',
          noteId: target.note_id,
          queueKind: sourceQueue satisfies LearningQueueKind,
          rating: input.rating,
          reviewedAt,
          resultState: toLearningState(replayed.state),
          targetId: target.target_id,
        }, reviewedAt),
      ],
      result: { eventId, state: toLearningState(replayed.state) },
    }
  }

  async rateMultiLineCard(
    input: RateMultiLineCardInput,
  ): Promise<MultiLineReviewResult> {
    assertNonEmpty(input.cardId, 'Multi-line CardID')
    if (input.itemRatings.length === 0)
      throw new TypeError('A multi-line Review requires at least one item Rating')
    if (input.setRating !== undefined)
      assertReviewRating(input.setRating)
    const itemInputs = input.itemRatings.map(item => normalizeRatingInput(item))
    const itemTargetIds = itemInputs.map(item => item.input.targetId)
    if (new Set(itemTargetIds).size !== itemTargetIds.length)
      throw new Error(`Multi-line Card ${input.cardId} contains duplicate item Ratings`)

    const activeTargets = await this.#context.database.all<ReviewTargetRow>(
      'SELECT t.target_id, t.card_id, t.target_kind, t.target_order, t.active, t.created_at, c.active AS card_active, c.note_id, c.source_block_id, c.kind, c.direction FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id WHERE t.card_id = ? AND t.active = 1 AND c.active = 1 ORDER BY t.target_order, t.target_id',
      [input.cardId],
    )
    const mainTargets = activeTargets.filter(target => target.target_kind === 'whole')
    const itemTargets = activeTargets.filter(target => target.target_kind === 'item')
    const mainTarget = mainTargets[0]
    if (mainTargets.length !== 1 || !mainTarget)
      throw new Error(`Multi-line Card ${input.cardId} must contain exactly one main Target`)
    if (input.mainPreparation.targetId !== mainTarget.target_id)
      throw new Error(`Multi-line Card ${input.cardId} was prepared with the wrong main Target`)
    if (itemTargets.length !== itemTargetIds.length
      || itemTargets.some((target, index) => target.target_id !== itemTargetIds[index])) {
      throw new Error(`Multi-line Card ${input.cardId} Ratings do not match its active item Targets`)
    }
    if ((mainTarget.kind !== 'list' && mainTarget.kind !== 'set') || mainTarget.direction !== 'forward')
      throw new Error(`Card ${input.cardId} is not a forward List or Set Card`)

    let mainRating: ReviewRating
    if (mainTarget.kind === 'list') {
      if (input.setRating !== undefined)
        throw new TypeError('A List Card cannot use a Set-level Rating')
      mainRating = aggregateMultiLineRating(itemInputs.map(item => item.input.rating))
    }
    else {
      if (input.setRating === undefined)
        throw new TypeError('A Set Card requires its overall Rating')
      mainRating = input.setRating
      const itemRatings = itemInputs.map(item => item.input.rating)
      if (mainRating === 'again') {
        if (itemRatings.some(rating => rating !== 'again'))
          throw new Error('A Set rated Again must mark every item Again')
      }
      else if (itemRatings.some(rating => (
        rating !== mainRating && rating !== 'again' && rating !== 'hard'
      ))) {
        throw new Error('Set item Ratings must be the overall Rating, Again, or Hard')
      }
    }
    const mainInput = normalizeRatingInput(preparedRating(
      input.mainPreparation,
      mainRating,
      input.responseMilliseconds,
    ))
    const normalized = [...itemInputs, mainInput]
    const eventIds = normalized.map(item => item.eventId)
    if (new Set(eventIds).size !== eventIds.length)
      throw new Error(`Multi-line Card ${input.cardId} contains duplicate Review Event ids`)
    if (normalized.some(item => !item.hasExpectedWinningEvent))
      throw new TypeError('A multi-line Review requires complete preparation tokens')

    const existing = await Promise.all(normalized.map(item => this.#existingRating(item)))
    const committed = existing.filter((result): result is ReviewResult => result !== null)
    if (committed.length === normalized.length) {
      const mainResult = committed.at(-1)
      if (!mainResult)
        throw new Error(`Multi-line Card ${input.cardId} is missing its committed main result`)
      return { itemResults: committed.slice(0, -1), mainResult }
    }
    if (committed.length > 0)
      throw new Error(`Multi-line Card ${input.cardId} Review was only partially committed`)

    const sync = await this.#context.syncState()
    const mutations: RatingMutation[] = []
    for (const [index, item] of normalized.entries())
      mutations.push(await this.#ratingMutation(item, sync, sync.next_device_sequence + index))
    await this.#context.database.batch([
      ...mutations.flatMap(mutation => mutation.commands),
      {
        parameters: [sync.next_device_sequence + mutations.length],
        sql: 'UPDATE learning_sync_state SET next_device_sequence = ? WHERE singleton = 1',
      },
    ])
    const results = mutations.map(mutation => mutation.result)
    const mainResult = results.at(-1)
    if (!mainResult)
      throw new Error(`Multi-line Card ${input.cardId} did not produce a main Review result`)
    return { itemResults: results.slice(0, -1), mainResult }
  }

  async rateTarget(input: RateLearningTargetInput): Promise<ReviewResult> {
    const normalized = normalizeRatingInput(input)
    const existing = await this.#existingRating(normalized)
    if (existing)
      return existing
    const sync = await this.#context.syncState()
    const mutation = await this.#ratingMutation(normalized, sync, sync.next_device_sequence)
    await this.#context.database.batch([
      ...mutation.commands,
      {
        parameters: [sync.next_device_sequence + 1],
        sql: 'UPDATE learning_sync_state SET next_device_sequence = ? WHERE singleton = 1',
      },
    ])
    return mutation.result
  }
}
