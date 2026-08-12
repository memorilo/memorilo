import type {
  FsrsOptimizerConfiguration,
  PersistedLearningState,
  RatingEventForReplay,
  RatingHistory,
} from '@memorilo/srs'
import type { DatabaseCommand, EditorStorageDatabase } from '../database-driver'
import type { ReviewRating } from './types'
import { isStrugglingMultiLineItem, replayRatings } from '@memorilo/srs'
import { stateCommand } from './learning-storage-shared'

export interface LearningReviewOptimizer {
  configuration: FsrsOptimizerConfiguration
  revisionId: string
}

export interface LearningReviewTarget {
  createdAt: number
  targetId: string
  targetKind: 'item' | 'whole'
}

export interface ReviewEventRow {
  base_event_id: string | null
  event_id: string
  event_kind: 'rating' | 'reset' | 'undo'
  occurred_at: number
  rating: ReviewRating | null
  reset_epoch: string | null
  undoes_event_id: string | null
}

function compareEvents(left: ReviewEventRow, right: ReviewEventRow): number {
  return left.occurred_at - right.occurred_at || left.event_id.localeCompare(right.event_id)
}

export function canonicalRatings(events: readonly ReviewEventRow[]): readonly RatingEventForReplay[] {
  const undone = new Set(events
    .filter(event => event.event_kind === 'undo')
    .map((event) => {
      if (event.undoes_event_id === null)
        throw new Error(`Stored Undo Event ${event.event_id} does not reference an Event`)
      return event.undoes_event_id
    }))
  const resets = events
    .filter(event => event.event_kind === 'reset' && !undone.has(event.event_id))
    .sort(compareEvents)
  const lastReset = resets.at(-1)
  const ratings = events
    .filter((event): event is ReviewEventRow & { rating: ReviewRating } => (
      event.event_kind === 'rating'
      && event.rating !== null
      && !undone.has(event.event_id)
      && (lastReset === undefined || compareEvents(event, lastReset) > 0)
    ))
  const byId = new Map(ratings.map(event => [event.event_id, event]))
  const candidates = [...ratings].sort(compareEvents).reverse()
  for (const candidate of candidates) {
    const path: Array<ReviewEventRow & { rating: ReviewRating }> = []
    const visited = new Set<string>()
    let current: (ReviewEventRow & { rating: ReviewRating }) | undefined = candidate
    let valid = true
    while (current) {
      if (visited.has(current.event_id)) {
        valid = false
        break
      }
      visited.add(current.event_id)
      path.push(current)
      if (current.base_event_id === null)
        break
      const parent = byId.get(current.base_event_id)
      if (!parent) {
        valid = false
        break
      }
      current = parent
    }
    if (valid) {
      return path.reverse().map(event => ({
        eventId: event.event_id,
        occurredAt: event.occurred_at,
        rating: event.rating,
      }))
    }
  }
  return []
}

export function itemPartialActive(canonical: readonly RatingEventForReplay[]): boolean {
  return isStrugglingMultiLineItem(canonical.map(event => event.rating))
}

export class LearningReviewHistory {
  readonly #database: EditorStorageDatabase

  constructor(database: EditorStorageDatabase) {
    this.#database = database
  }

  events(targetId: string): Promise<readonly ReviewEventRow[]> {
    return this.#database.all<ReviewEventRow>(
      'SELECT event_id, event_kind, rating, occurred_at, base_event_id, undoes_event_id, reset_epoch FROM learning_review_events WHERE target_id = ? ORDER BY occurred_at, event_id',
      [targetId],
    )
  }

  async ratings(targetId: string): Promise<readonly RatingEventForReplay[]> {
    return canonicalRatings(await this.events(targetId))
  }

  async replayState(
    target: { createdAt: number, targetId: string },
    optimizer: LearningReviewOptimizer,
    additionalEvents: readonly ReviewEventRow[] = [],
  ): Promise<{ canonical: readonly RatingEventForReplay[], state: PersistedLearningState }> {
    const canonical = canonicalRatings([
      ...(await this.events(target.targetId)),
      ...additionalEvents,
    ])
    return {
      canonical,
      state: replayRatings(
        target.targetId,
        target.createdAt,
        optimizer.revisionId,
        optimizer.configuration,
        canonical,
      ),
    }
  }

  async getRatingHistory(targetId: string): Promise<RatingHistory | undefined> {
    const storedEvents = await this.events(targetId)
    const undone = new Set(storedEvents
      .filter((event): event is ReviewEventRow & { undoes_event_id: string } => (
        event.event_kind === 'undo' && event.undoes_event_id !== null
      ))
      .map(event => event.undoes_event_id))
    const reset = storedEvents
      .filter(event => event.event_kind === 'reset' && !undone.has(event.event_id))
      .sort(compareEvents)
      .at(-1)
    const retainedRatings = storedEvents
      .filter((event): event is ReviewEventRow & { rating: ReviewRating } => (
        event.event_kind === 'rating'
        && event.rating !== null
        && !undone.has(event.event_id)
        && (reset === undefined || compareEvents(event, reset) > 0)
      ))
      .sort(compareEvents)
    if (retainedRatings.length === 0)
      return undefined
    return {
      ratings: retainedRatings.map(event => ({
        eventId: event.event_id,
        occurredAt: event.occurred_at,
        rating: event.rating,
      })),
      targetId,
    }
  }

  async ratingsByTarget(
    targetIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly RatingEventForReplay[]>> {
    const uniqueTargetIds = [...new Set(targetIds)]
    if (uniqueTargetIds.length === 0)
      return new Map()
    const placeholders = uniqueTargetIds.map(() => '?').join(', ')
    const storedEvents = await this.#database.all<ReviewEventRow & { target_id: string }>(
      `SELECT target_id, event_id, event_kind, rating, occurred_at, base_event_id, undoes_event_id, reset_epoch FROM learning_review_events WHERE target_id IN (${placeholders}) ORDER BY target_id, occurred_at, event_id`,
      uniqueTargetIds,
    )
    const eventsByTarget = new Map<string, ReviewEventRow[]>()
    for (const event of storedEvents) {
      const group = eventsByTarget.get(event.target_id)
      if (group)
        group.push(event)
      else
        eventsByTarget.set(event.target_id, [event])
    }
    return new Map(uniqueTargetIds.map(targetId => [
      targetId,
      canonicalRatings(eventsByTarget.get(targetId) ?? []),
    ]))
  }

  async buildRescheduleCommands(
    target: LearningReviewTarget,
    optimizer: LearningReviewOptimizer,
  ): Promise<readonly DatabaseCommand[]> {
    const canonical = await this.ratings(target.targetId)
    const state = replayRatings(
      target.targetId,
      target.createdAt,
      optimizer.revisionId,
      optimizer.configuration,
      canonical,
    )
    const commands: DatabaseCommand[] = [stateCommand(state)]
    if (target.targetKind === 'item') {
      commands.push({
        parameters: [itemPartialActive(canonical) ? 1 : 0, target.targetId],
        sql: 'UPDATE learning_targets SET partial_active = ? WHERE target_id = ?',
      })
    }
    return commands
  }
}
