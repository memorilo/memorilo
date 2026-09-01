import type { LearningQueueCandidate, LearningQueueKind } from '@memorilo/srs'
import type { EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from '../database-driver'
import type { LearningReviewHistory } from './learning-review-history'
import type { LearningStateRow } from './learning-storage-shared'
import type {
  FsrsOptimizerConfiguration,
  GetLearningActivitySummaryInput,
  LearningActivitySummary,
  LearningDailyProgress,
  LearningPracticeConfiguration,
  LearningQueueItem,
  LearningSessionQueueItem,
  ListLearningQueueInput,
} from './types'
import { selectLearningQueue, selectMultiLinePresentation, studyDayBounds, validateLearningPracticeConfiguration } from '@memorilo/srs'
import { and, asc, desc, eq, gte, isNull, lte, notExists, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { learningCards, learningNoteOptimizerAssignments, learningOptimizerRevisions, learningOptimizers, learningQueueExclusions, learningReadingItems, learningReviewEvents, learningSiblingBuryEvents, learningStates, learningTargets } from '../drizzle-schema'
import { LearningQueueProgressReader, readFirstReviewTimes } from './learning-queue-progress'
import {
  assertNonEmpty,
  assertTimestamp,
  parseOptimizerConfiguration,
} from './learning-storage-shared'
import { GLOBAL_OPTIMIZER_ID } from './schema'

const undoneSiblingBuryEvents = alias(learningReviewEvents, 'undone_sibling_bury_events')

interface QueueRow extends LearningStateRow {
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
  target_kind: 'item' | 'whole'
  target_order: number
  topic_id: string
  topic_order: number
  configuration_json: string
  excluded_until: number | null
}

interface SiblingBuryEventRow {
  note_id: string
  source_card_id: string
  source_block_id: string
  source_queue: LearningQueueKind
  occurred_at: number
}

interface LearningQueueRepositoryDependencies {
  configuration: () => LearningPracticeConfiguration
  database: EditorStorageDatabase
  history: Pick<LearningReviewHistory, 'ratingsByTarget'>
  runOperation: StorageOperationRunner
}

export class LearningQueueRepository {
  readonly #configuration: () => LearningPracticeConfiguration
  readonly #database: EditorStorageDatabase
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #history: LearningQueueRepositoryDependencies['history']
  readonly #progress: LearningQueueProgressReader
  readonly #runOperation: StorageOperationRunner

  constructor(dependencies: LearningQueueRepositoryDependencies) {
    this.#configuration = dependencies.configuration
    this.#database = dependencies.database
    this.#orm = dependencies.database.drizzle
    this.#history = dependencies.history
    this.#progress = new LearningQueueProgressReader({
      configuration: dependencies.configuration,
      database: dependencies.database,
    })
    this.#runOperation = dependencies.runOperation
  }

  #practiceConfiguration(): LearningPracticeConfiguration {
    return validateLearningPracticeConfiguration(this.#configuration())
  }

  getActivitySummary(
    input: GetLearningActivitySummaryInput = {},
  ): Promise<LearningActivitySummary> {
    return this.#runOperation(() => this.#progress.getActivitySummary(input))
  }

  getDailyProgress(now = Date.now()): Promise<LearningDailyProgress> {
    return this.#runOperation(() => this.#progress.getDailyProgress(now))
  }

  nextKind(input: Omit<ListLearningQueueInput, 'limit' | 'mode'> = {}): Promise<'reading' | 'review' | null> {
    return this.#runOperation(async () => {
      const now = input.now ?? Date.now()
      const scope = [input.noteId ?? null, input.topicId ?? null] as const
      const reading = this.#orm.select({
        present: sql<number>`SUM(CASE WHEN ${learningReadingItems.nextProcessAt} IS NULL OR ${learningReadingItems.nextProcessAt} <= ${now} THEN 1 ELSE 0 END)`,
        last_action_at: sql<number | null>`MAX(${learningReadingItems.lastProcessedAt})`,
      }).from(learningReadingItems).where(and(
        scope[0] === null ? undefined : eq(learningReadingItems.noteId, scope[0]),
        scope[1] === null ? undefined : eq(learningReadingItems.topicId, scope[1]),
      )).get() as { last_action_at: number | null, present: number } | undefined
      const review = this.#orm.select({
        hard_due: sql<number>`MAX(CASE WHEN ${learningStates.phase} = 'review' AND ${learningStates.dueAt} <= ${now} THEN 1 ELSE 0 END)`,
        last_action_at: sql<number | null>`MAX(${learningReviewEvents.occurredAt})`,
        present: sql<number>`COUNT(DISTINCT ${learningTargets.targetId})`,
      }).from(learningTargets).innerJoin(learningCards, eq(learningCards.cardId, learningTargets.cardId)).innerJoin(learningStates, eq(learningStates.targetId, learningTargets.targetId)).leftJoin(learningReviewEvents, and(eq(learningReviewEvents.targetId, learningTargets.targetId), eq(learningReviewEvents.eventKind, 'rating'))).where(and(
        eq(learningTargets.active, 1),
        eq(learningCards.active, 1),
        or(eq(learningStates.phase, 'new'), sql`${learningStates.dueAt} <= ${now}`),
        scope[0] === null ? undefined : eq(learningCards.noteId, scope[0]),
        scope[1] === null ? undefined : eq(learningCards.topicId, scope[1]),
      )).get() as { hard_due: number, last_action_at: number | null, present: number } | undefined
      if (!reading?.present && !review?.present)
        return null
      if (!review?.present)
        return 'reading'
      if (!reading?.present || review.hard_due === 1)
        return 'review'
      return (reading.last_action_at ?? Number.NEGATIVE_INFINITY) <= (review.last_action_at ?? Number.NEGATIVE_INFINITY)
        ? 'reading'
        : 'review'
    })
  }

  async listReview(input: ListLearningQueueInput = {}): Promise<readonly LearningQueueItem[]> {
    const now = input.now ?? Date.now()
    assertTimestamp(now, 'Queue time')
    const limit = input.limit ?? 100
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new RangeError('Learning queue limit must be a positive safe integer')
    const mode = input.mode ?? 'mixed'
    if (mode !== 'mixed' && mode !== 'new' && mode !== 'review')
      throw new TypeError(`Unsupported Learning Queue mode: ${String(mode)}`)
    if (input.noteId !== undefined)
      assertNonEmpty(input.noteId, 'Queue Note id')
    if (input.topicId !== undefined) {
      assertNonEmpty(input.topicId, 'Queue Topic id')
      if (input.noteId === undefined)
        throw new TypeError('A Queue Topic scope requires a Note id')
    }
    return this.#runOperation(async () => {
      const noteId = input.noteId ?? null
      const topicId = input.topicId ?? null
      const { queuePolicy } = this.#practiceConfiguration()
      const { startedAt: studyDay } = studyDayBounds(now, queuePolicy.studyDayStartsAtHour)
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
        configuration_json: learningOptimizerRevisions.configurationJson,
        excluded_until: sql<number | null>`MAX(${learningQueueExclusions.untilAt})`,
      }).from(learningTargets).innerJoin(learningCards, eq(learningCards.cardId, learningTargets.cardId)).innerJoin(learningStates, eq(learningStates.targetId, learningTargets.targetId)).leftJoin(learningNoteOptimizerAssignments, eq(learningNoteOptimizerAssignments.noteId, learningCards.noteId)).innerJoin(learningOptimizers, eq(learningOptimizers.optimizerId, sql`COALESCE(${learningNoteOptimizerAssignments.optimizerId}, ${GLOBAL_OPTIMIZER_ID})`)).innerJoin(learningOptimizerRevisions, eq(learningOptimizerRevisions.revisionId, learningOptimizers.currentRevisionId)).leftJoin(learningQueueExclusions, and(eq(learningQueueExclusions.cardId, learningCards.cardId), sql`${learningQueueExclusions.reason} <> 'sibling_bury'`, sql`${learningQueueExclusions.untilAt} > ${now}`)).where(and(
        eq(learningTargets.active, 1),
        eq(learningCards.active, 1),
        noteId === null ? undefined : eq(learningCards.noteId, noteId),
        topicId === null ? undefined : eq(learningCards.topicId, topicId),
      )).groupBy(
        learningTargets.targetId,
        learningTargets.cardId,
        learningTargets.targetKind,
        learningTargets.targetOrder,
        learningTargets.itemBlockId,
        learningTargets.active,
        learningTargets.partialActive,
        learningTargets.createdAt,
        learningCards.active,
        learningCards.noteId,
        learningCards.topicId,
        learningCards.topicOrder,
        learningCards.sourceBlockId,
        learningCards.sourceOrder,
        learningCards.kind,
        learningCards.direction,
        learningStates.phase,
        learningStates.dueAt,
        learningStates.stability,
        learningStates.difficulty,
        learningStates.scheduledDays,
        learningStates.learningSteps,
        learningStates.reps,
        learningStates.lapses,
        learningStates.lastReviewAt,
        learningStates.optimizerRevisionId,
        learningStates.winningEventId,
        learningStates.stateHash,
        learningOptimizerRevisions.configurationJson,
      ).all() as QueueRow[]
      if (rows.length === 0)
        return []
      const [siblingBuryEvents, firstReviews, ratingsByTarget] = await Promise.all([
        this.#orm.select({
          source_card_id: learningSiblingBuryEvents.sourceCardId,
          note_id: learningSiblingBuryEvents.noteId,
          source_block_id: learningSiblingBuryEvents.sourceBlockId,
          source_queue: learningSiblingBuryEvents.sourceQueue,
          occurred_at: learningSiblingBuryEvents.occurredAt,
        }).from(learningSiblingBuryEvents).where(and(
          gte(learningSiblingBuryEvents.occurredAt, studyDay),
          lte(learningSiblingBuryEvents.occurredAt, now),
          notExists(this.#orm.select({ eventId: undoneSiblingBuryEvents.eventId })
            .from(undoneSiblingBuryEvents)
            .where(and(
              eq(undoneSiblingBuryEvents.eventKind, 'undo'),
              eq(undoneSiblingBuryEvents.undoesEventId, learningSiblingBuryEvents.sourceEventId),
            ))),
        )).all() as SiblingBuryEventRow[],
        readFirstReviewTimes(this.#database),
        this.#history.ratingsByTarget(rows
          .filter(row => row.target_kind === 'item')
          .map(row => row.target_id)),
      ])
      const introducedNewCards = firstReviews.filter(review => (
        review.first_reviewed_at >= studyDay && review.first_reviewed_at <= now
      )).length
      const remainingNewCards = Math.max(0, queuePolicy.maxNewCardsPerDay - introducedNewCards)
      const byCard = new Map<string, QueueRow[]>()
      for (const row of rows) {
        if (row.excluded_until !== null && row.excluded_until > now)
          continue
        const group = byCard.get(row.card_id)
        if (group)
          group.push(row)
        else
          byCard.set(row.card_id, [row])
      }
      const candidates: LearningQueueCandidate<LearningQueueItem>[] = []
      const appendCandidate = (
        row: QueueRow,
        optimizerConfiguration: FsrsOptimizerConfiguration,
        presentation: LearningQueueItem['presentation'],
        targetIds: readonly string[],
      ): void => {
        candidates.push({
          cardId: row.card_id,
          dueAt: row.due_at,
          lastReviewAt: row.last_review_at,
          noteId: row.note_id,
          optimizerConfiguration,
          phase: row.phase,
          scheduledDays: row.scheduled_days,
          sourceBlockId: row.source_block_id,
          sourceOrder: row.source_order,
          stability: row.stability,
          topicOrder: row.topic_order,
          value: {
            cardId: row.card_id,
            dueAt: row.due_at,
            kind: 'review',
            noteId: row.note_id,
            phase: row.phase,
            presentation,
            sourceBlockId: row.source_block_id,
            targetIds,
            topicId: row.topic_id,
          },
        })
      }
      for (const group of byCard.values()) {
        const first = group[0]
        if (!first)
          throw new Error('Learning queue produced an empty Card group')
        const configuration = parseOptimizerConfiguration(first.configuration_json)
        const mainRows = group.filter(row => row.target_kind === 'whole')
        const itemRows = group
          .filter(row => row.target_kind === 'item')
          .sort((left, right) => left.target_order - right.target_order)
        if (itemRows.length === 0) {
          const main = mainRows[0]
          if (mainRows.length !== 1 || !main)
            throw new Error(`Card ${first.card_id} must contain exactly one whole Target`)
          appendCandidate(main, configuration, 'full', [main.target_id])
          continue
        }
        const main = mainRows[0]
        if (mainRows.length !== 1 || !main)
          throw new Error(`Forward List/Set Card ${first.card_id} must contain exactly one main Target`)
        if ((first.kind !== 'list' && first.kind !== 'set') || first.direction !== 'forward')
          throw new Error(`Card ${first.card_id} cannot combine whole and item Targets`)
        const selection = selectMultiLinePresentation({
          items: itemRows.map(row => ({
            dueAt: row.due_at,
            ratings: (ratingsByTarget.get(row.target_id) ?? []).map(event => event.rating),
            targetId: row.target_id,
          })),
          mainDueAt: main.due_at,
          now,
        })
        if (selection.presentation === 'partial') {
          const itemById = new Map(itemRows.map(row => [row.target_id, row]))
          for (const targetId of selection.targetIds) {
            const row = itemById.get(targetId)
            if (!row)
              throw new Error(`Partial Target ${targetId} is missing from Card ${first.card_id}`)
            appendCandidate(row, configuration, 'partial', [targetId])
          }
        }
        else {
          const earliest = [...group].sort((left, right) => left.due_at - right.due_at)[0]
          if (!earliest)
            throw new Error(`Forward List/Set Card ${first.card_id} has no scheduling Target`)
          appendCandidate(earliest, configuration, 'full', itemRows.map(row => row.target_id))
        }
      }
      return selectLearningQueue({
        candidates,
        introducedCardIds: new Set(firstReviews.map(review => review.card_id)),
        limit,
        mode,
        now,
        policy: queuePolicy,
        remainingNewCards,
        siblingBuryEvents: siblingBuryEvents.map(event => ({
          noteId: event.note_id,
          sourceBlockId: event.source_block_id,
          sourceCardId: event.source_card_id,
          sourceQueue: event.source_queue,
        })),
      })
    })
  }

  async list(input: ListLearningQueueInput = {}): Promise<readonly LearningSessionQueueItem[]> {
    const mode = input.mode ?? 'mixed'
    if (mode !== 'mixed')
      return this.listReview(input).then(items => items.map(item => ({ ...item, kind: 'review' as const })))

    const [reviews, readings] = await Promise.all([
      this.listReview({ ...input, mode: 'mixed' }),
      this.#runOperation(() => this.#listReadingItems(input)),
    ])
    const readingItems: LearningSessionQueueItem[] = readings.map(item => ({
      dueAt: item.due_at ?? 0,
      kind: 'reading',
      noteId: item.note_id,
      priority: item.priority,
      readingItemId: item.reading_item_id,
      sourceBlockId: item.source_block_id,
      topicId: item.topic_id,
    }))
    const reviewItems: LearningSessionQueueItem[] = reviews.map(item => ({ ...item, kind: 'review' as const }))
    const ordered: LearningSessionQueueItem[] = []
    const firstKind = await this.nextKind(input)
    let readingIndex = 0
    let reviewIndex = 0
    while (ordered.length < (input.limit ?? 100) && (readingIndex < readingItems.length || reviewIndex < reviewItems.length)) {
      const preferReading = firstKind === 'reading'
        ? ordered.length % 2 === 0
        : firstKind === 'review' ? ordered.length % 2 === 1 : readingIndex < readingItems.length
      if ((preferReading && readingIndex < readingItems.length) || reviewIndex >= reviewItems.length)
        ordered.push(readingItems[readingIndex++]!)
      else
        ordered.push(reviewItems[reviewIndex++]!)
    }
    return ordered
  }

  async #listReadingItems(input: ListLearningQueueInput): Promise<readonly {
    due_at: number | null
    note_id: string
    priority: number
    reading_item_id: string
    source_block_id: string
    topic_id: string
  }[]> {
    const now = input.now ?? Date.now()
    return this.#orm.select({
      due_at: learningReadingItems.nextProcessAt,
      note_id: learningReadingItems.noteId,
      priority: learningReadingItems.priority,
      reading_item_id: learningReadingItems.readingItemId,
      source_block_id: learningReadingItems.sourceBlockId,
      topic_id: learningReadingItems.topicId,
    }).from(learningReadingItems).where(and(
      or(isNull(learningReadingItems.nextProcessAt), sql`${learningReadingItems.nextProcessAt} <= ${now}`),
      input.noteId === undefined ? undefined : eq(learningReadingItems.noteId, input.noteId),
      input.topicId === undefined ? undefined : eq(learningReadingItems.topicId, input.topicId),
    )).orderBy(desc(learningReadingItems.priority), sql`COALESCE(${learningReadingItems.nextProcessAt}, 0)`, asc(learningReadingItems.readingItemId)).all() as Array<{
      due_at: number | null
      note_id: string
      priority: number
      reading_item_id: string
      source_block_id: string
      topic_id: string
    }>
  }
}
