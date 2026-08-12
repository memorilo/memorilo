import type { LearningQueueCandidate, LearningQueueKind } from '@memorilo/srs'
import type { EditorStorageDatabase, StorageOperationRunner } from '../database-driver'
import type { LearningReviewHistory } from './learning-review-history'
import type { LearningStateRow } from './learning-storage-shared'
import type {
  FsrsOptimizerConfiguration,
  LearningDailyProgress,
  LearningPracticeConfiguration,
  LearningQueueItem,
  ListLearningQueueInput,
} from './types'
import { selectLearningQueue, selectMultiLinePresentation, studyDayBounds, validateLearningPracticeConfiguration } from '@memorilo/srs'
import { LearningQueueProgressReader, readFirstReviewTimes } from './learning-queue-progress'
import {
  assertNonEmpty,
  assertTimestamp,
  parseOptimizerConfiguration,
} from './learning-storage-shared'
import { GLOBAL_OPTIMIZER_ID } from './schema'

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
  readonly #history: LearningQueueRepositoryDependencies['history']
  readonly #progress: LearningQueueProgressReader
  readonly #runOperation: StorageOperationRunner

  constructor(dependencies: LearningQueueRepositoryDependencies) {
    this.#configuration = dependencies.configuration
    this.#database = dependencies.database
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

  getDailyProgress(now = Date.now()): Promise<LearningDailyProgress> {
    return this.#runOperation(() => this.#progress.getDailyProgress(now))
  }

  async list(input: ListLearningQueueInput = {}): Promise<readonly LearningQueueItem[]> {
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
      const rows = await this.#database.all<QueueRow>(
        'SELECT t.target_id, t.card_id, t.target_kind, t.target_order, t.item_block_id, t.active, t.partial_active, t.created_at, c.active AS card_active, c.note_id, c.topic_id, c.topic_order, c.source_block_id, c.source_order, c.kind, c.direction, s.phase, s.due_at, s.stability, s.difficulty, s.scheduled_days, s.learning_steps, s.reps, s.lapses, s.last_review_at, s.optimizer_revision_id, s.winning_event_id, s.state_hash, r.configuration_json, MAX(e.until_at) AS excluded_until FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id JOIN learning_states s ON s.target_id = t.target_id LEFT JOIN learning_note_optimizer_assignments a ON a.note_id = c.note_id JOIN learning_optimizers o ON o.optimizer_id = COALESCE(a.optimizer_id, ?) JOIN learning_optimizer_revisions r ON r.revision_id = o.current_revision_id LEFT JOIN learning_queue_exclusions e ON e.card_id = c.card_id AND e.reason <> \'sibling_bury\' AND e.until_at > ? WHERE t.active = 1 AND c.active = 1 AND (? IS NULL OR c.note_id = ?) AND (? IS NULL OR c.topic_id = ?) GROUP BY t.target_id',
        [GLOBAL_OPTIMIZER_ID, now, noteId, noteId, topicId, topicId],
      )
      if (rows.length === 0)
        return []
      const [siblingBuryEvents, firstReviews, ratingsByTarget] = await Promise.all([
        this.#database.all<SiblingBuryEventRow>(
          'SELECT source_card_id, note_id, source_block_id, source_queue, occurred_at FROM learning_sibling_bury_events bury WHERE occurred_at >= ? AND occurred_at <= ? AND NOT EXISTS (SELECT 1 FROM learning_review_events undo WHERE undo.event_kind = \'undo\' AND undo.undoes_event_id = bury.source_event_id)',
          [studyDay, now],
        ),
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
}
