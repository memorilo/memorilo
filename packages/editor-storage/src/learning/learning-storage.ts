import type { DatabaseCommand, EditorStorageDatabase } from '../database-driver'
import type { PersistedLearningState, RatingEventForReplay } from './fsrs-adapter'
import type {
  AcknowledgeLearningSyncInput,
  AssignNoteOptimizerInput,
  CreateFsrsOptimizerInput,
  FsrsOptimizer,
  FsrsOptimizerConfiguration,
  LearningCardProjection,
  LearningMaintenanceEstimate,
  LearningMaintenanceResult,
  LearningNoteSummary,
  LearningQueueItem,
  LearningState,
  LearningStorage,
  LearningSyncChange,
  LearningTarget,
  ListLearningQueueInput,
  OptimizeFsrsOptimizerInput,
  RateLearningTargetInput,
  ReconcileLearningCardsInput,
  RenameFsrsOptimizerInput,
  ResetLearningTargetInput,
  ReviewRating,
  ReviewResult,
  UndoLearningReviewInput,
  UpdateFsrsOptimizerInput,
} from './types'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import {
  computeParameters,
  FSRSBindingItem,
  FSRSBindingReview,
} from '@open-spaced-repetition/binding'
import { forgetting_curve } from 'ts-fsrs'
import { v5 as createUuidV5, v7 as createUuidV7 } from 'uuid'
import {
  defaultOptimizerConfiguration,
  emptyLearningState,
  FSRSVersion,
  replayRatings,
  validateOptimizerConfiguration,
} from './fsrs-adapter'
import {
  GLOBAL_OPTIMIZER_ID,
  GLOBAL_OPTIMIZER_REVISION_ID,
  learningSchema,
} from './schema'

const targetNamespace = '8a276bb8-9a21-4fe0-a7fe-52af36fd6839'
const learningSchemaGeneration = 1

interface OptimizerRow {
  configuration_json: string
  created_at: number
  current_revision_id: string
  is_global: number
  name: string
  optimizer_id: string
  status: 'active' | 'archived'
  updated_at: number
}

interface EffectiveOptimizerRow extends OptimizerRow {
  note_id: string
}

interface TargetRow {
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
  target_order: number
  target_kind: 'item' | 'whole'
  topic_id: string
  topic_order: number
}

interface StateRow {
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

interface ReviewEventRow {
  base_event_id: string | null
  event_id: string
  event_kind: 'rating' | 'reset' | 'undo'
  occurred_at: number
  rating: ReviewRating | null
  reset_epoch: string | null
  undoes_event_id: string | null
}

interface SyncStateRow {
  device_id: string
  last_server_sequence: number
  next_device_sequence: number
}

interface QueueRow extends TargetRow, StateRow {
  configuration_json: string
  excluded_until: number | null
}

interface CountRow {
  count: number
}

interface ExistingCardRow {
  active: number
  card_id: string
  direction: 'backward' | 'forward'
  kind: 'basic' | 'cloze' | 'list' | 'set'
  source_block_id: string
  source_order: number
  topic_order: number
}

interface ExistingTargetRow {
  active: number
  item_block_id: string | null
  target_id: string
  target_kind: 'item' | 'whole'
  target_order: number
}

interface LearningNoteSummaryRow {
  card_count: number
  note_id: string
  note_title: string
  optimizer_id: string
  optimizer_is_global: number
  optimizer_name: string
  optimizer_status: 'active' | 'archived'
  topic_count: number
  updated_at: number
}

function assertNonEmpty(value: string, description: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`${description} must be a non-empty string`)
}

function assertTimestamp(value: number, description: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${description} must be a non-negative safe integer timestamp`)
}

function parseConfiguration(json: string): FsrsOptimizerConfiguration {
  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== 'object')
    throw new TypeError('Stored FSRS Optimizer configuration must be an object')
  return validateOptimizerConfiguration(parsed as FsrsOptimizerConfiguration)
}

function toOptimizer(row: OptimizerRow): FsrsOptimizer {
  return {
    configuration: parseConfiguration(row.configuration_json),
    createdAt: row.created_at,
    id: row.optimizer_id,
    isGlobal: row.is_global === 1,
    name: row.name,
    revisionId: row.current_revision_id,
    status: row.status,
    updatedAt: row.updated_at,
  }
}

function toLearningTarget(row: TargetRow): LearningTarget {
  return {
    active: row.active === 1 && row.card_active === 1,
    cardId: row.card_id,
    itemBlockId: row.item_block_id,
    kind: row.target_kind,
    partialActive: row.partial_active === 1,
    targetId: row.target_id,
  }
}

function toLearningState(row: StateRow): LearningState {
  return {
    difficulty: row.difficulty,
    dueAt: row.due_at,
    lapses: row.lapses,
    lastReviewAt: row.last_review_at,
    learningSteps: row.learning_steps,
    optimizerRevisionId: row.optimizer_revision_id,
    phase: row.phase,
    reps: row.reps,
    scheduledDays: row.scheduled_days,
    stability: row.stability,
    targetId: row.target_id,
    winningEventId: row.winning_event_id,
  }
}

function targetId(cardId: string, itemBlockId: string | null): string {
  return createUuidV5(itemBlockId === null ? `whole:${cardId}` : `item:${cardId}:${itemBlockId}`, targetNamespace)
}

function syncMutationCommand(
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

function stateCommand(state: PersistedLearningState): DatabaseCommand {
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
    sql: 'INSERT INTO learning_states (target_id, phase, due_at, stability, difficulty, scheduled_days, learning_steps, reps, lapses, last_review_at, optimizer_revision_id, winning_event_id, state_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(target_id) DO UPDATE SET phase = excluded.phase, due_at = excluded.due_at, stability = excluded.stability, difficulty = excluded.difficulty, scheduled_days = excluded.scheduled_days, learning_steps = excluded.learning_steps, reps = excluded.reps, lapses = excluded.lapses, last_review_at = excluded.last_review_at, optimizer_revision_id = excluded.optimizer_revision_id, winning_event_id = excluded.winning_event_id, state_hash = excluded.state_hash',
  }
}

function insertInitialStateCommand(state: PersistedLearningState): DatabaseCommand {
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
    sql: 'INSERT INTO learning_states (target_id, phase, due_at, stability, difficulty, scheduled_days, learning_steps, reps, lapses, last_review_at, optimizer_revision_id, winning_event_id, state_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(target_id) DO NOTHING',
  }
}

function targetProjection(card: LearningCardProjection): readonly { itemBlockId: string | null, kind: 'item' | 'whole', targetId: string, targetOrder: number }[] {
  const usesItemTargets = (card.kind === 'list' || card.kind === 'set') && card.direction === 'forward'
  if (!usesItemTargets)
    return [{ itemBlockId: null, kind: 'whole', targetId: targetId(card.cardId, null), targetOrder: 0 }]
  if (card.itemBlockIds.length === 0)
    throw new TypeError(`Forward List/Set Card ${card.cardId} must contain at least one item`)
  const seen = new Set<string>()
  return card.itemBlockIds.map((itemBlockId, targetOrder) => {
    assertNonEmpty(itemBlockId, 'Card item Block id')
    if (seen.has(itemBlockId))
      throw new Error(`Card ${card.cardId} contains duplicate item Block ${itemBlockId}`)
    seen.add(itemBlockId)
    return { itemBlockId, kind: 'item' as const, targetId: targetId(card.cardId, itemBlockId), targetOrder }
  })
}

function reviewRatingNumber(rating: ReviewRating): number {
  switch (rating) {
    case 'again':
      return 1
    case 'hard':
      return 2
    case 'good':
      return 3
    case 'easy':
      return 4
  }
}

function canonicalRatings(events: readonly ReviewEventRow[]): readonly RatingEventForReplay[] {
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

function compareEvents(left: ReviewEventRow, right: ReviewEventRow): number {
  return left.occurred_at - right.occurred_at || left.event_id.localeCompare(right.event_id)
}

function nextStudyDay(now: number, startHour: number): number {
  const current = new Date(now)
  const boundary = new Date(current)
  boundary.setHours(startHour, 0, 0, 0)
  if (current.getTime() >= boundary.getTime())
    boundary.setDate(boundary.getDate() + 1)
  return boundary.getTime()
}

function currentStudyDay(now: number, startHour: number): number {
  const current = new Date(now)
  const boundary = new Date(current)
  boundary.setHours(startHour, 0, 0, 0)
  if (current.getTime() < boundary.getTime())
    boundary.setDate(boundary.getDate() - 1)
  return boundary.getTime()
}

function deterministicOrderKey(studyDay: number, cardId: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${String(studyDay)}:${cardId}`)))
}

class DefaultLearningStorage implements LearningStorage {
  readonly #database: EditorStorageDatabase
  #writeQueue: Promise<void> = Promise.resolve()

  private constructor(database: EditorStorageDatabase) {
    this.#database = database
  }

  static async create(database: EditorStorageDatabase): Promise<DefaultLearningStorage> {
    await database.exec(learningSchema)
    const now = Date.now()
    const configuration = defaultOptimizerConfiguration()
    await database.batch([
      {
        parameters: [GLOBAL_OPTIMIZER_ID, 'Global', now, now],
        sql: 'INSERT INTO learning_optimizers (optimizer_id, name, is_global, status, created_at, updated_at) VALUES (?, ?, 1, \'active\', ?, ?) ON CONFLICT(optimizer_id) DO NOTHING',
      },
      {
        parameters: [
          GLOBAL_OPTIMIZER_REVISION_ID,
          GLOBAL_OPTIMIZER_ID,
          JSON.stringify(configuration),
          FSRSVersion,
          now,
        ],
        sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(revision_id) DO NOTHING',
      },
      {
        parameters: [GLOBAL_OPTIMIZER_REVISION_ID, GLOBAL_OPTIMIZER_ID],
        sql: 'UPDATE learning_optimizers SET current_revision_id = COALESCE(current_revision_id, ?) WHERE optimizer_id = ?',
      },
      {
        parameters: [createUuidV7(), learningSchemaGeneration],
        sql: 'INSERT INTO learning_sync_state (singleton, device_id, next_device_sequence, last_server_sequence, schema_generation) VALUES (1, ?, 1, 0, ?) ON CONFLICT(singleton) DO NOTHING',
      },
    ])
    return new DefaultLearningStorage(database)
  }

  async #serializeWrite<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#writeQueue.then(operation)
    this.#writeQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async #syncState(): Promise<SyncStateRow> {
    const row = await this.#database.get<SyncStateRow>('SELECT device_id, next_device_sequence, last_server_sequence FROM learning_sync_state WHERE singleton = 1')
    if (!row)
      throw new Error('Learning sync state is missing')
    return row
  }

  async #optimizerRow(optimizerId: string): Promise<OptimizerRow> {
    const row = await this.#database.get<OptimizerRow>(
      'SELECT o.optimizer_id, o.name, o.is_global, o.status, o.current_revision_id, o.created_at, o.updated_at, r.configuration_json FROM learning_optimizers o JOIN learning_optimizer_revisions r ON r.revision_id = o.current_revision_id WHERE o.optimizer_id = ?',
      [optimizerId],
    )
    if (!row)
      throw new Error(`Unknown FSRS Optimizer: ${optimizerId}`)
    return row
  }

  async #effectiveOptimizer(noteId: string): Promise<EffectiveOptimizerRow> {
    const row = await this.#database.get<EffectiveOptimizerRow>(
      'SELECT ? AS note_id, o.optimizer_id, o.name, o.is_global, o.status, o.current_revision_id, o.created_at, o.updated_at, r.configuration_json FROM learning_optimizers o JOIN learning_optimizer_revisions r ON r.revision_id = o.current_revision_id WHERE o.optimizer_id = COALESCE((SELECT optimizer_id FROM learning_note_optimizer_assignments WHERE note_id = ?), ?)',
      [noteId, noteId, GLOBAL_OPTIMIZER_ID],
    )
    if (!row)
      throw new Error(`Note ${noteId} has no effective FSRS Optimizer`)
    if (row.status !== 'active')
      throw new Error(`Note ${noteId} references archived FSRS Optimizer ${row.optimizer_id}`)
    return row
  }

  async #targetRow(targetIdValue: string, requireActive = true): Promise<TargetRow> {
    const row = await this.#database.get<TargetRow>(
      'SELECT t.target_id, t.card_id, t.target_kind, t.target_order, t.item_block_id, t.active, t.partial_active, t.created_at, c.active AS card_active, c.note_id, c.topic_id, c.topic_order, c.source_block_id, c.source_order, c.kind, c.direction FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id WHERE t.target_id = ?',
      [targetIdValue],
    )
    if (!row)
      throw new Error(`Unknown Review Target: ${targetIdValue}`)
    if (requireActive && (row.active !== 1 || row.card_active !== 1))
      throw new Error(`Review Target ${targetIdValue} is inactive`)
    return row
  }

  async #stateRow(targetIdValue: string): Promise<StateRow> {
    const row = await this.#database.get<StateRow>(
      'SELECT target_id, phase, due_at, stability, difficulty, scheduled_days, learning_steps, reps, lapses, last_review_at, optimizer_revision_id, winning_event_id, state_hash FROM learning_states WHERE target_id = ?',
      [targetIdValue],
    )
    if (!row)
      throw new Error(`Review Target ${targetIdValue} has no Learning State`)
    return row
  }

  async #events(targetIdValue: string): Promise<readonly ReviewEventRow[]> {
    return this.#database.all<ReviewEventRow>(
      'SELECT event_id, event_kind, rating, occurred_at, base_event_id, undoes_event_id, reset_epoch FROM learning_review_events WHERE target_id = ? ORDER BY occurred_at, event_id',
      [targetIdValue],
    )
  }

  async #replayedState(
    target: TargetRow,
    optimizer: OptimizerRow,
    additionalEvents: readonly ReviewEventRow[] = [],
  ): Promise<{ canonical: readonly RatingEventForReplay[], state: PersistedLearningState }> {
    const canonical = canonicalRatings([...(await this.#events(target.target_id)), ...additionalEvents])
    return {
      canonical,
      state: replayRatings(
        target.target_id,
        target.created_at,
        optimizer.current_revision_id,
        parseConfiguration(optimizer.configuration_json),
        canonical,
      ),
    }
  }

  async reconcileTopicCards(input: ReconcileLearningCardsInput): Promise<void> {
    assertNonEmpty(input.noteId, 'Note id')
    assertNonEmpty(input.topicId, 'Topic id')
    if (!Number.isSafeInteger(input.topicOrder) || input.topicOrder < 0)
      throw new RangeError('Topic order must be a non-negative safe integer')
    const cards = structuredClone(input.cards)
    const seenCards = new Set<string>()
    for (const card of cards) {
      assertNonEmpty(card.cardId, 'CardID')
      assertNonEmpty(card.sourceBlockId, 'Source Block id')
      if (seenCards.has(card.cardId))
        throw new Error(`Topic ${input.topicId} projects duplicate CardID ${card.cardId}`)
      seenCards.add(card.cardId)
      if (!['basic', 'cloze', 'list', 'set'].includes(card.kind))
        throw new TypeError(`Unsupported learning Card kind: ${String(card.kind)}`)
      if (card.direction !== 'forward' && card.direction !== 'backward')
        throw new TypeError(`Unsupported learning Card direction: ${String(card.direction)}`)
      targetProjection(card)
    }

    await this.#serializeWrite(async () => {
      const optimizer = await this.#effectiveOptimizer(input.noteId)
      const existingCards = await this.#database.all<ExistingCardRow>(
        'SELECT card_id, topic_order, source_block_id, source_order, kind, direction, active FROM learning_cards WHERE note_id = ? AND topic_id = ?',
        [input.noteId, input.topicId],
      )
      const existingById = new Map(existingCards.map(row => [row.card_id, row]))
      for (const card of cards) {
        const owner = await this.#database.get<{ note_id: string, topic_id: string }>(
          'SELECT note_id, topic_id FROM learning_cards WHERE card_id = ?',
          [card.cardId],
        )
        if (owner && owner.note_id !== input.noteId)
          throw new Error(`CardID ${card.cardId} already belongs to Note ${owner.note_id}`)
      }

      const commands: DatabaseCommand[] = []
      const now = Date.now()
      for (const existing of existingCards) {
        if (!seenCards.has(existing.card_id) && existing.active === 1) {
          commands.push(
            {
              parameters: [now, existing.card_id],
              sql: 'UPDATE learning_cards SET active = 0, inactive_at = ?, sync_sequence = -1 WHERE card_id = ?',
            },
            {
              parameters: [now, existing.card_id],
              sql: 'UPDATE learning_targets SET active = 0, inactive_at = ? WHERE card_id = ?',
            },
            syncMutationCommand('card', existing.card_id, 'upsert', { active: false }, now),
          )
        }
      }

      for (const [sourceOrder, card] of cards.entries()) {
        const projectedTargets = targetProjection(card)
        const projectedTargetIds = new Set(projectedTargets.map(target => target.targetId))
        const storedTargets = await this.#database.all<ExistingTargetRow>(
          'SELECT target_id, target_kind, item_block_id, target_order, active FROM learning_targets WHERE card_id = ?',
          [card.cardId],
        )
        const storedTargetById = new Map(storedTargets.map(target => [target.target_id, target]))
        const existing = existingById.get(card.cardId)
        const cardChanged = existing === undefined
          || existing.active !== 1
          || existing.topic_order !== input.topicOrder
          || existing.source_block_id !== card.sourceBlockId
          || existing.source_order !== sourceOrder
          || existing.kind !== card.kind
          || existing.direction !== card.direction
        const targetsChanged = projectedTargets.some((target) => {
          const stored = storedTargetById.get(target.targetId)
          return stored === undefined
            || stored.active !== 1
            || stored.target_kind !== target.kind
            || stored.item_block_id !== target.itemBlockId
            || stored.target_order !== target.targetOrder
        }) || storedTargets.some(target => (
          target.active === 1 && !projectedTargetIds.has(target.target_id)
        ))
        if (!cardChanged && !targetsChanged)
          continue
        commands.push({
          parameters: [
            card.cardId,
            input.noteId,
            input.topicId,
            input.topicOrder,
            card.sourceBlockId,
            sourceOrder,
            card.kind,
            card.direction,
            now,
            now,
          ],
          sql: 'INSERT INTO learning_cards (card_id, note_id, topic_id, topic_order, source_block_id, source_order, kind, direction, active, first_seen_at, last_seen_at, inactive_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL) ON CONFLICT(card_id) DO UPDATE SET note_id = excluded.note_id, topic_id = excluded.topic_id, topic_order = excluded.topic_order, source_block_id = excluded.source_block_id, source_order = excluded.source_order, kind = excluded.kind, direction = excluded.direction, active = 1, last_seen_at = excluded.last_seen_at, inactive_at = NULL, sync_sequence = -1',
        })
        for (const storedTarget of storedTargets) {
          if (!projectedTargetIds.has(storedTarget.target_id)) {
            commands.push({
              parameters: [now, storedTarget.target_id],
              sql: 'UPDATE learning_targets SET active = 0, inactive_at = ? WHERE target_id = ?',
            })
          }
        }
        for (const target of projectedTargets) {
          commands.push({
            parameters: [
              target.targetId,
              card.cardId,
              target.kind,
              target.itemBlockId,
              target.targetOrder,
              now,
            ],
            sql: 'INSERT INTO learning_targets (target_id, card_id, target_kind, item_block_id, target_order, active, created_at, inactive_at) VALUES (?, ?, ?, ?, ?, 1, ?, NULL) ON CONFLICT(target_id) DO UPDATE SET target_order = excluded.target_order, active = 1, inactive_at = NULL',
          })
          commands.push(insertInitialStateCommand(emptyLearningState(
            target.targetId,
            now,
            optimizer.current_revision_id,
          )))
        }
        commands.push(syncMutationCommand('card', card.cardId, 'upsert', {
          active: true,
          cardId: card.cardId,
          direction: card.direction,
          itemBlockIds: card.itemBlockIds,
          kind: card.kind,
          noteId: input.noteId,
          sourceBlockId: card.sourceBlockId,
          sourceOrder,
          topicOrder: input.topicOrder,
          topicId: input.topicId,
        }, now))
      }
      await this.#database.batch(commands)
    })
  }

  async listTargets(cardIdValue: string): Promise<readonly LearningTarget[]> {
    assertNonEmpty(cardIdValue, 'CardID')
    const rows = await this.#database.all<TargetRow>(
      'SELECT t.target_id, t.card_id, t.target_kind, t.target_order, t.item_block_id, t.active, t.partial_active, t.created_at, c.active AS card_active, c.note_id, c.topic_id, c.topic_order, c.source_block_id, c.source_order, c.kind, c.direction FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id WHERE t.card_id = ? ORDER BY t.target_order, t.target_id',
      [cardIdValue],
    )
    return rows.map(toLearningTarget)
  }

  async listNoteTopicIds(noteId: string): Promise<readonly string[]> {
    assertNonEmpty(noteId, 'Note id')
    const rows = await this.#database.all<{ topic_id: string }>(
      'SELECT DISTINCT topic_id FROM learning_cards WHERE note_id = ? ORDER BY topic_id',
      [noteId],
    )
    return rows.map(row => row.topic_id)
  }

  async listNotesWithCards(): Promise<readonly LearningNoteSummary[]> {
    const rows = await this.#database.all<LearningNoteSummaryRow>(`
      WITH card_topics AS (
        SELECT
          note_id,
          topic_id,
          COUNT(*) AS card_count
        FROM learning_cards
        WHERE active = 1
        GROUP BY note_id, topic_id
      )
      SELECT
        note.id AS note_id,
        note.title AS note_title,
        note.updated_at,
        optimizer.optimizer_id,
        optimizer.name AS optimizer_name,
        optimizer.is_global AS optimizer_is_global,
        optimizer.status AS optimizer_status,
        SUM(card_topics.card_count) AS card_count,
        COUNT(*) AS topic_count
      FROM card_topics
      INNER JOIN notes AS note ON note.id = card_topics.note_id
      LEFT JOIN learning_note_optimizer_assignments AS assignment ON assignment.note_id = note.id
      INNER JOIN learning_optimizers AS optimizer
        ON optimizer.optimizer_id = COALESCE(assignment.optimizer_id, ?)
      GROUP BY
        note.id,
        note.title,
        note.updated_at,
        optimizer.optimizer_id,
        optimizer.name,
        optimizer.is_global,
        optimizer.status
      ORDER BY note.updated_at DESC, note.id DESC
    `, [GLOBAL_OPTIMIZER_ID])
    return rows.map((row) => {
      if (row.optimizer_status !== 'active')
        throw new Error(`Note ${row.note_id} references archived FSRS Optimizer ${row.optimizer_id}`)
      return {
        cardCount: row.card_count,
        noteId: row.note_id,
        noteTitle: row.note_title,
        optimizer: {
          id: row.optimizer_id,
          isGlobal: row.optimizer_is_global === 1,
          name: row.optimizer_name,
        },
        topicCount: row.topic_count,
        updatedAt: row.updated_at,
      }
    })
  }

  async getLearningState(targetIdValue: string): Promise<LearningState> {
    assertNonEmpty(targetIdValue, 'Review Target id')
    return toLearningState(await this.#stateRow(targetIdValue))
  }

  async rateTarget(input: RateLearningTargetInput): Promise<ReviewResult> {
    assertNonEmpty(input.targetId, 'Review Target id')
    if (!['again', 'hard', 'good', 'easy'].includes(input.rating))
      throw new TypeError(`Unsupported Rating: ${String(input.rating)}`)
    const reviewedAt = input.reviewedAt ?? Date.now()
    assertTimestamp(reviewedAt, 'Review time')
    if (input.responseMilliseconds !== undefined
      && (!Number.isSafeInteger(input.responseMilliseconds) || input.responseMilliseconds < 0)) {
      throw new RangeError('Response time must be a non-negative safe integer')
    }
    const eventId = input.eventId ?? createUuidV7()
    assertNonEmpty(eventId, 'Review Event id')

    return this.#serializeWrite(async () => {
      const existing = await this.#database.get<{
        event_kind: ReviewEventRow['event_kind']
        occurred_at: number
        rating: ReviewRating | null
        response_milliseconds: number | null
        target_id: string
      }>(
        'SELECT target_id, event_kind, rating, occurred_at, response_milliseconds FROM learning_review_events WHERE event_id = ?',
        [eventId],
      )
      if (existing) {
        if (existing.event_kind !== 'rating'
          || existing.target_id !== input.targetId
          || existing.rating !== input.rating
          || (input.reviewedAt !== undefined && existing.occurred_at !== reviewedAt)
          || existing.response_milliseconds !== (input.responseMilliseconds ?? null)) {
          throw new Error(`Review Event ${eventId} was retried with different data`)
        }
        return { eventId, state: toLearningState(await this.#stateRow(input.targetId)) }
      }

      const target = await this.#targetRow(input.targetId)
      const optimizer = await this.#effectiveOptimizer(target.note_id)
      const currentState = await this.#stateRow(input.targetId)
      const sync = await this.#syncState()
      const event: ReviewEventRow = {
        base_event_id: currentState.winning_event_id,
        event_id: eventId,
        event_kind: 'rating',
        occurred_at: reviewedAt,
        rating: input.rating,
        reset_epoch: null,
        undoes_event_id: null,
      }
      const replayed = await this.#replayedState(target, optimizer, [event])
      const partialActive = target.target_kind === 'item'
        && (input.rating === 'again'
          || (target.partial_active === 1 && replayed.state.phase !== 'review'))
      const commands: DatabaseCommand[] = [
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
            JSON.stringify(toLearningStateObject(replayed.state)),
            sync.device_id,
            sync.next_device_sequence,
            FSRSVersion,
          ],
          sql: 'INSERT INTO learning_review_events (event_id, target_id, card_id, note_id, event_kind, rating, occurred_at, response_milliseconds, scheduled_days, elapsed_days, base_event_id, result_state_json, device_id, device_sequence, fsrs_version) VALUES (?, ?, ?, ?, \'rating\', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        },
        {
          parameters: [sync.next_device_sequence + 1],
          sql: 'UPDATE learning_sync_state SET next_device_sequence = ? WHERE singleton = 1',
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
          rating: input.rating,
          reviewedAt,
          targetId: target.target_id,
        }, reviewedAt),
      ]
      const configuration = parseConfiguration(optimizer.configuration_json)
      const shouldBury = currentState.phase === 'new'
        ? configuration.queuePolicy.buryNewSiblings
        : currentState.phase === 'learning' || currentState.phase === 'relearning'
          ? configuration.queuePolicy.buryInterdayLearningSiblings
          : configuration.queuePolicy.buryReviewSiblings
      if (shouldBury) {
        commands.push({
          parameters: [
            nextStudyDay(reviewedAt, configuration.queuePolicy.studyDayStartsAtHour),
            eventId,
            target.source_block_id,
            target.card_id,
          ],
          sql: 'INSERT INTO learning_queue_exclusions (card_id, reason, until_at, source_event_id) SELECT card_id, \'sibling_bury\', ?, ? FROM learning_cards WHERE source_block_id = ? AND card_id <> ? AND active = 1 ON CONFLICT(card_id, reason) DO UPDATE SET until_at = excluded.until_at, source_event_id = excluded.source_event_id',
        })
      }
      await this.#database.batch(commands)
      return { eventId, state: toLearningStateObject(replayed.state) }
    })
  }

  async resetTarget(input: ResetLearningTargetInput): Promise<LearningState> {
    assertNonEmpty(input.targetId, 'Review Target id')
    const resetAt = input.resetAt ?? Date.now()
    assertTimestamp(resetAt, 'Reset time')
    const eventId = input.eventId ?? createUuidV7()
    assertNonEmpty(eventId, 'Reset Event id')
    return this.#serializeWrite(async () => {
      const existing = await this.#database.get<{
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
        return toLearningState(await this.#stateRow(input.targetId))
      }
      const target = await this.#targetRow(input.targetId)
      const optimizer = await this.#effectiveOptimizer(target.note_id)
      const sync = await this.#syncState()
      const state = emptyLearningState(target.target_id, resetAt, optimizer.current_revision_id)
      await this.#database.batch([
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
          targetId: target.target_id,
        }, resetAt),
      ])
      return toLearningStateObject(state)
    })
  }

  async undoLastReview(input: UndoLearningReviewInput): Promise<LearningState> {
    assertNonEmpty(input.targetId, 'Review Target id')
    const undoneAt = input.undoneAt ?? Date.now()
    assertTimestamp(undoneAt, 'Undo time')
    const eventId = input.eventId ?? createUuidV7()
    assertNonEmpty(eventId, 'Undo Event id')
    return this.#serializeWrite(async () => {
      const existing = await this.#database.get<{
        event_kind: ReviewEventRow['event_kind']
        occurred_at: number
        target_id: string
      }>(
        'SELECT target_id, event_kind, occurred_at FROM learning_review_events WHERE event_id = ?',
        [eventId],
      )
      if (existing) {
        if (existing.event_kind !== 'undo'
          || existing.target_id !== input.targetId
          || (input.undoneAt !== undefined && existing.occurred_at !== undoneAt)) {
          throw new Error(`Undo Event ${eventId} was retried with different data`)
        }
        return toLearningState(await this.#stateRow(input.targetId))
      }
      const target = await this.#targetRow(input.targetId)
      const optimizer = await this.#effectiveOptimizer(target.note_id)
      const current = await this.#stateRow(input.targetId)
      if (current.winning_event_id === null)
        throw new Error(`Review Target ${input.targetId} has no Rating to undo`)
      const sync = await this.#syncState()
      const undoEvent: ReviewEventRow = {
        base_event_id: current.winning_event_id,
        event_id: eventId,
        event_kind: 'undo',
        occurred_at: undoneAt,
        rating: null,
        reset_epoch: null,
        undoes_event_id: current.winning_event_id,
      }
      const replayed = await this.#replayedState(target, optimizer, [undoEvent])
      const partialActive = target.target_kind === 'item'
        && replayed.state.phase !== 'new'
        && replayed.state.phase !== 'review'
        && replayed.canonical.some(event => event.rating === 'again')
      await this.#database.batch([
        {
          parameters: [
            eventId,
            target.target_id,
            target.card_id,
            target.note_id,
            undoneAt,
            current.winning_event_id,
            current.winning_event_id,
            sync.device_id,
            sync.next_device_sequence,
            FSRSVersion,
          ],
          sql: 'INSERT INTO learning_review_events (event_id, target_id, card_id, note_id, event_kind, occurred_at, base_event_id, undoes_event_id, device_id, device_sequence, fsrs_version) VALUES (?, ?, ?, ?, \'undo\', ?, ?, ?, ?, ?, ?)',
        },
        {
          parameters: [sync.next_device_sequence + 1],
          sql: 'UPDATE learning_sync_state SET next_device_sequence = ? WHERE singleton = 1',
        },
        stateCommand(replayed.state),
        {
          parameters: [partialActive ? 1 : 0, target.target_id],
          sql: 'UPDATE learning_targets SET partial_active = ? WHERE target_id = ?',
        },
        {
          parameters: [current.winning_event_id],
          sql: 'DELETE FROM learning_queue_exclusions WHERE source_event_id = ?',
        },
        syncMutationCommand('review-event', eventId, 'upsert', {
          eventId,
          kind: 'undo',
          targetId: target.target_id,
          undoesEventId: current.winning_event_id,
          undoneAt,
        }, undoneAt),
      ])
      return toLearningStateObject(replayed.state)
    })
  }

  async getOptimizer(optimizerId: string): Promise<FsrsOptimizer> {
    assertNonEmpty(optimizerId, 'FSRS Optimizer id')
    return toOptimizer(await this.#optimizerRow(optimizerId))
  }

  async getNoteOptimizer(noteId: string): Promise<FsrsOptimizer> {
    assertNonEmpty(noteId, 'Note id')
    const note = await this.#database.get<{ id: string }>('SELECT id FROM notes WHERE id = ?', [noteId])
    if (!note)
      throw new Error(`Unknown Note: ${noteId}`)
    return toOptimizer(await this.#effectiveOptimizer(noteId))
  }

  async getOptimizerNoteCount(optimizerId: string): Promise<number> {
    assertNonEmpty(optimizerId, 'FSRS Optimizer id')
    const optimizer = await this.#optimizerRow(optimizerId)
    const row = optimizer.is_global === 1
      ? await this.#database.get<CountRow>(
          'SELECT COUNT(*) AS count FROM notes n LEFT JOIN learning_note_optimizer_assignments a ON a.note_id = n.id WHERE COALESCE(a.optimizer_id, ?) = ?',
          [GLOBAL_OPTIMIZER_ID, GLOBAL_OPTIMIZER_ID],
        )
      : await this.#database.get<CountRow>(
          'SELECT COUNT(*) AS count FROM learning_note_optimizer_assignments WHERE optimizer_id = ?',
          [optimizerId],
        )
    if (!row)
      throw new Error(`Failed to count Notes for FSRS Optimizer ${optimizerId}`)
    return row.count
  }

  async listOptimizers(): Promise<readonly FsrsOptimizer[]> {
    const rows = await this.#database.all<OptimizerRow>(
      'SELECT o.optimizer_id, o.name, o.is_global, o.status, o.current_revision_id, o.created_at, o.updated_at, r.configuration_json FROM learning_optimizers o JOIN learning_optimizer_revisions r ON r.revision_id = o.current_revision_id ORDER BY o.is_global DESC, o.name COLLATE NOCASE',
    )
    return rows.map(toOptimizer)
  }

  async createOptimizer(input: CreateFsrsOptimizerInput): Promise<FsrsOptimizer> {
    const name = input.name.trim()
    assertNonEmpty(name, 'FSRS Optimizer name')
    const id = input.id ?? createUuidV7()
    assertNonEmpty(id, 'FSRS Optimizer id')
    const configuration = validateOptimizerConfiguration(
      input.configuration ?? defaultOptimizerConfiguration(),
    )
    return this.#serializeWrite(async () => {
      const now = Date.now()
      const revisionId = createUuidV7()
      await this.#database.batch([
        {
          parameters: [id, name, revisionId, now, now],
          sql: 'INSERT INTO learning_optimizers (optimizer_id, name, is_global, status, current_revision_id, created_at, updated_at) VALUES (?, ?, 0, \'active\', ?, ?, ?)',
        },
        {
          parameters: [revisionId, id, JSON.stringify(configuration), FSRSVersion, now],
          sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, ?, ?)',
        },
        syncMutationCommand('optimizer', id, 'upsert', {
          configuration,
          id,
          name,
          revisionId,
          status: 'active',
        }, now),
      ])
      return this.getOptimizer(id)
    })
  }

  async renameOptimizer(input: RenameFsrsOptimizerInput): Promise<FsrsOptimizer> {
    assertNonEmpty(input.optimizerId, 'FSRS Optimizer id')
    const name = input.name.trim()
    assertNonEmpty(name, 'FSRS Optimizer name')
    return this.#serializeWrite(async () => {
      const optimizer = await this.#optimizerRow(input.optimizerId)
      if (optimizer.is_global === 1)
        throw new Error('Global FSRS Optimizer cannot be renamed')
      if (optimizer.status !== 'active')
        throw new Error(`Cannot rename archived FSRS Optimizer ${input.optimizerId}`)
      if (optimizer.name === name)
        return toOptimizer(optimizer)
      const now = Date.now()
      await this.#database.batch([
        {
          parameters: [name, now, input.optimizerId],
          sql: 'UPDATE learning_optimizers SET name = ?, updated_at = ?, sync_sequence = -1 WHERE optimizer_id = ?',
        },
        syncMutationCommand('optimizer', input.optimizerId, 'upsert', {
          configuration: parseConfiguration(optimizer.configuration_json),
          id: input.optimizerId,
          name,
          revisionId: optimizer.current_revision_id,
          status: 'active',
        }, now),
      ])
      return this.getOptimizer(input.optimizerId)
    })
  }

  async assignNoteOptimizer(input: AssignNoteOptimizerInput): Promise<void> {
    assertNonEmpty(input.noteId, 'Note id')
    assertNonEmpty(input.optimizerId, 'FSRS Optimizer id')
    await this.#serializeWrite(async () => {
      const optimizer = await this.#optimizerRow(input.optimizerId)
      if (optimizer.status !== 'active')
        throw new Error(`Cannot assign archived FSRS Optimizer ${input.optimizerId}`)
      const note = await this.#database.get<{ id: string }>('SELECT id FROM notes WHERE id = ?', [input.noteId])
      if (!note)
        throw new Error(`Unknown Note: ${input.noteId}`)
      const now = Date.now()
      await this.#database.batch([
        {
          parameters: [input.noteId, input.optimizerId, now],
          sql: 'INSERT INTO learning_note_optimizer_assignments (note_id, optimizer_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET optimizer_id = excluded.optimizer_id, updated_at = excluded.updated_at, sync_sequence = -1',
        },
        syncMutationCommand('assignment', input.noteId, 'upsert', input, now),
      ])
    })
  }

  async updateOptimizer(input: UpdateFsrsOptimizerInput): Promise<FsrsOptimizer> {
    assertNonEmpty(input.optimizerId, 'FSRS Optimizer id')
    const configuration = validateOptimizerConfiguration(input.configuration)
    return this.#serializeWrite(() => this.#updateOptimizerRevision(input, configuration))
  }

  async #updateOptimizerRevision(
    input: UpdateFsrsOptimizerInput,
    configuration: FsrsOptimizerConfiguration,
    expectedRevisionId?: string,
  ): Promise<FsrsOptimizer> {
    const current = await this.#optimizerRow(input.optimizerId)
    if (current.status !== 'active')
      throw new Error(`Cannot update archived FSRS Optimizer ${input.optimizerId}`)
    if (expectedRevisionId !== undefined && current.current_revision_id !== expectedRevisionId) {
      throw new Error(
        `FSRS Optimizer ${input.optimizerId} changed while parameter optimization was running`,
      )
    }
    const now = Date.now()
    const revisionId = createUuidV7()
    const commands: DatabaseCommand[] = [
      {
        parameters: [revisionId, input.optimizerId, JSON.stringify(configuration), FSRSVersion, now],
        sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, ?, ?)',
      },
      {
        parameters: [revisionId, now, input.optimizerId],
        sql: 'UPDATE learning_optimizers SET current_revision_id = ?, updated_at = ?, sync_sequence = -1 WHERE optimizer_id = ?',
      },
      syncMutationCommand('optimizer', input.optimizerId, 'upsert', {
        configuration,
        id: input.optimizerId,
        revisionId,
        status: 'active',
      }, now),
    ]
    if (input.rescheduleNow)
      commands.push(...await this.#rescheduleCommands(input.optimizerId, revisionId, configuration))
    await this.#database.batch(commands)
    return this.getOptimizer(input.optimizerId)
  }

  async resetOptimizerDefaults(optimizerId: string, rescheduleNow = false): Promise<FsrsOptimizer> {
    return this.updateOptimizer({
      configuration: defaultOptimizerConfiguration(),
      optimizerId,
      rescheduleNow,
    })
  }

  async #targetsForOptimizer(optimizerId: string): Promise<readonly TargetRow[]> {
    return this.#database.all<TargetRow>(
      'SELECT t.target_id, t.card_id, t.target_kind, t.target_order, t.item_block_id, t.active, t.partial_active, t.created_at, c.active AS card_active, c.note_id, c.topic_id, c.topic_order, c.source_block_id, c.source_order, c.kind, c.direction FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id LEFT JOIN learning_note_optimizer_assignments a ON a.note_id = c.note_id WHERE COALESCE(a.optimizer_id, ?) = ?',
      [GLOBAL_OPTIMIZER_ID, optimizerId],
    )
  }

  async #rescheduleCommands(
    optimizerId: string,
    revisionId: string,
    configuration: FsrsOptimizerConfiguration,
  ): Promise<readonly DatabaseCommand[]> {
    const commands: DatabaseCommand[] = []
    for (const target of await this.#targetsForOptimizer(optimizerId)) {
      const canonical = canonicalRatings(await this.#events(target.target_id))
      const state = replayRatings(target.target_id, target.created_at, revisionId, configuration, canonical)
      commands.push(stateCommand(state))
      if (target.target_kind === 'item') {
        const partialActive = state.phase !== 'new'
          && state.phase !== 'review'
          && canonical.some(event => event.rating === 'again')
        commands.push({
          parameters: [partialActive ? 1 : 0, target.target_id],
          sql: 'UPDATE learning_targets SET partial_active = ? WHERE target_id = ?',
        })
      }
    }
    return commands
  }

  async archiveOptimizer(optimizerId: string): Promise<void> {
    assertNonEmpty(optimizerId, 'FSRS Optimizer id')
    await this.#serializeWrite(async () => {
      const optimizer = await this.#optimizerRow(optimizerId)
      if (optimizer.is_global === 1)
        throw new Error('Global FSRS Optimizer cannot be archived')
      if (optimizer.status === 'archived')
        return
      const global = await this.#optimizerRow(GLOBAL_OPTIMIZER_ID)
      const configuration = parseConfiguration(global.configuration_json)
      const noteRows = await this.#database.all<{ note_id: string }>(
        'SELECT note_id FROM learning_note_optimizer_assignments WHERE optimizer_id = ?',
        [optimizerId],
      )
      const assignedNoteIds = new Set(noteRows.map(row => row.note_id))
      const targets = await this.#database.all<TargetRow>(
        'SELECT t.target_id, t.card_id, t.target_kind, t.target_order, t.item_block_id, t.active, t.partial_active, t.created_at, c.active AS card_active, c.note_id, c.topic_id, c.topic_order, c.source_block_id, c.source_order, c.kind, c.direction FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id JOIN learning_states s ON s.target_id = t.target_id WHERE c.note_id IN (SELECT note_id FROM learning_note_optimizer_assignments WHERE optimizer_id = ?) OR s.optimizer_revision_id IN (SELECT revision_id FROM learning_optimizer_revisions WHERE optimizer_id = ?)',
        [optimizerId, optimizerId],
      )
      const commands: DatabaseCommand[] = []
      for (const target of targets) {
        const destination = assignedNoteIds.has(target.note_id)
          ? global
          : await this.#effectiveOptimizer(target.note_id)
        const destinationConfiguration = destination.optimizer_id === global.optimizer_id
          ? configuration
          : parseConfiguration(destination.configuration_json)
        const canonical = canonicalRatings(await this.#events(target.target_id))
        const state = replayRatings(
          target.target_id,
          target.created_at,
          destination.current_revision_id,
          destinationConfiguration,
          canonical,
        )
        commands.push(stateCommand(state))
        if (target.target_kind === 'item') {
          const partialActive = state.phase !== 'new'
            && state.phase !== 'review'
            && canonical.some(event => event.rating === 'again')
          commands.push({
            parameters: [partialActive ? 1 : 0, target.target_id],
            sql: 'UPDATE learning_targets SET partial_active = ? WHERE target_id = ?',
          })
        }
      }
      const now = Date.now()
      commands.push(
        {
          parameters: [now, optimizerId],
          sql: 'UPDATE learning_optimizers SET status = \'archived\', updated_at = ?, sync_sequence = -1 WHERE optimizer_id = ?',
        },
        {
          parameters: [GLOBAL_OPTIMIZER_ID, now, optimizerId],
          sql: 'UPDATE learning_note_optimizer_assignments SET optimizer_id = ?, updated_at = ?, sync_sequence = -1 WHERE optimizer_id = ?',
        },
        syncMutationCommand('optimizer', optimizerId, 'upsert', {
          id: optimizerId,
          status: 'archived',
        }, now),
      )
      for (const note of noteRows) {
        commands.push(syncMutationCommand('assignment', note.note_id, 'upsert', {
          noteId: note.note_id,
          optimizerId: GLOBAL_OPTIMIZER_ID,
        }, now))
      }
      await this.#database.batch(commands)
    })
  }

  async #optimizerTrainingData(optimizerId: string): Promise<{
    fingerprint: string
    items: FSRSBindingItem[]
  }> {
    const items: FSRSBindingItem[] = []
    const facts: Array<readonly [string, readonly (readonly [string, number, ReviewRating])[]]> = []
    const targets = [...await this.#targetsForOptimizer(optimizerId)]
      .sort((left, right) => left.target_id.localeCompare(right.target_id))
    for (const target of targets) {
      const events = await this.#events(target.target_id)
      const undone = new Set(events
        .filter(event => event.event_kind === 'undo' && event.undoes_event_id !== null)
        .map(event => event.undoes_event_id as string))
      const resets = events
        .filter(event => event.event_kind === 'reset' && !undone.has(event.event_id))
        .sort(compareEvents)
      const reset = resets.at(-1)
      const ratings = events
        .filter((event): event is ReviewEventRow & { rating: ReviewRating } => (
          event.event_kind === 'rating'
          && event.rating !== null
          && !undone.has(event.event_id)
          && (reset === undefined || compareEvents(event, reset) > 0)
        ))
        .sort(compareEvents)
      if (ratings.length === 0)
        continue
      facts.push([target.target_id, ratings.map(event => [
        event.event_id,
        event.occurred_at,
        event.rating,
      ] as const)])
      const firstRating = ratings[0]
      if (!firstRating)
        throw new Error('Optimizer training target unexpectedly has no first Rating')
      let previous = firstRating.occurred_at
      const reviews = ratings.map((event, index) => {
        const deltaDays = index === 0
          ? 0
          : Math.max(0, Math.round((event.occurred_at - previous) / 86_400_000))
        previous = event.occurred_at
        return new FSRSBindingReview(reviewRatingNumber(event.rating), deltaDays)
      })
      items.push(new FSRSBindingItem(reviews))
    }
    return {
      fingerprint: bytesToHex(sha256(utf8ToBytes(JSON.stringify(facts)))),
      items,
    }
  }

  async optimizeOptimizer(input: OptimizeFsrsOptimizerInput): Promise<FsrsOptimizer> {
    assertNonEmpty(input.optimizerId, 'FSRS Optimizer id')
    const snapshot = await this.#serializeWrite(async () => {
      const optimizer = await this.#optimizerRow(input.optimizerId)
      if (optimizer.status !== 'active')
        throw new Error(`Cannot optimize archived FSRS Optimizer ${input.optimizerId}`)
      return {
        configuration: parseConfiguration(optimizer.configuration_json),
        data: await this.#optimizerTrainingData(input.optimizerId),
        revisionId: optimizer.current_revision_id,
      }
    })
    if (snapshot.data.items.length === 0)
      throw new Error(`FSRS Optimizer ${input.optimizerId} has no eligible Review Events`)
    const weights = await computeParameters(snapshot.data.items, {
      enableShortTerm: true,
      numRelearningSteps: snapshot.configuration.relearningSteps.length,
      timeout: input.timeoutMilliseconds ?? 60_000,
    })
    const optimizedConfiguration = validateOptimizerConfiguration({
      ...snapshot.configuration,
      fsrsParameters: weights,
    })
    return this.#serializeWrite(async () => {
      const currentData = await this.#optimizerTrainingData(input.optimizerId)
      if (currentData.fingerprint !== snapshot.data.fingerprint) {
        throw new Error(
          `FSRS Optimizer ${input.optimizerId} training data changed while optimization was running`,
        )
      }
      return this.#updateOptimizerRevision({
        configuration: optimizedConfiguration,
        optimizerId: input.optimizerId,
        rescheduleNow: input.rescheduleNow,
      }, optimizedConfiguration, snapshot.revisionId)
    })
  }

  async listQueue(input: ListLearningQueueInput = {}): Promise<readonly LearningQueueItem[]> {
    const now = input.now ?? Date.now()
    assertTimestamp(now, 'Queue time')
    const limit = input.limit ?? 100
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new RangeError('Learning queue limit must be a positive safe integer')
    const rows = await this.#database.all<QueueRow>(
      'SELECT t.target_id, t.card_id, t.target_kind, t.target_order, t.item_block_id, t.active, t.partial_active, t.created_at, c.active AS card_active, c.note_id, c.topic_id, c.topic_order, c.source_block_id, c.source_order, c.kind, c.direction, s.phase, s.due_at, s.stability, s.difficulty, s.scheduled_days, s.learning_steps, s.reps, s.lapses, s.last_review_at, s.optimizer_revision_id, s.winning_event_id, s.state_hash, r.configuration_json, MAX(e.until_at) AS excluded_until FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id JOIN learning_states s ON s.target_id = t.target_id LEFT JOIN learning_note_optimizer_assignments a ON a.note_id = c.note_id JOIN learning_optimizers o ON o.optimizer_id = COALESCE(a.optimizer_id, ?) JOIN learning_optimizer_revisions r ON r.revision_id = o.current_revision_id LEFT JOIN learning_queue_exclusions e ON e.card_id = c.card_id AND e.until_at > ? WHERE t.active = 1 AND c.active = 1 GROUP BY t.target_id',
      [GLOBAL_OPTIMIZER_ID, now],
    )
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

    const candidates: Array<{
      config: FsrsOptimizerConfiguration
      item: LearningQueueItem
      row: QueueRow
    }> = []
    const isDue = (row: QueueRow, configuration: FsrsOptimizerConfiguration): boolean => {
      const learnAhead = (row.phase === 'learning' || row.phase === 'relearning')
        && row.scheduled_days === 0
        ? configuration.queuePolicy.learnAheadMinutes * 60_000
        : 0
      return row.due_at <= now + learnAhead
    }
    for (const group of byCard.values()) {
      const first = group[0]
      if (!first)
        throw new Error('Learning queue produced an empty Card group')
      const configuration = parseConfiguration(first.configuration_json)
      const usesItems = first.target_kind === 'item'
      if (!usesItems) {
        if (isDue(first, configuration)) {
          candidates.push({
            config: configuration,
            row: first,
            item: {
              cardId: first.card_id,
              dueAt: first.due_at,
              noteId: first.note_id,
              phase: first.phase,
              presentation: 'full',
              sourceBlockId: first.source_block_id,
              targetIds: [first.target_id],
              topicId: first.topic_id,
            },
          })
        }
        continue
      }
      const partial = group.filter(row => row.partial_active === 1)
      if (partial.length > 0) {
        for (const row of partial) {
          if (isDue(row, configuration)) {
            candidates.push({
              config: configuration,
              row,
              item: {
                cardId: row.card_id,
                dueAt: row.due_at,
                noteId: row.note_id,
                phase: row.phase,
                presentation: 'partial',
                sourceBlockId: row.source_block_id,
                targetIds: [row.target_id],
                topicId: row.topic_id,
              },
            })
          }
        }
      }
      else {
        const ordered = [...group].sort((left, right) => left.due_at - right.due_at)
        const earliest = ordered[0]
        if (!earliest)
          throw new Error(`Forward List/Set Card ${first.card_id} has no Review Targets`)
        if (isDue(earliest, configuration)) {
          candidates.push({
            config: configuration,
            row: earliest,
            item: {
              cardId: first.card_id,
              dueAt: earliest.due_at,
              noteId: first.note_id,
              phase: earliest.phase,
              presentation: 'full',
              sourceBlockId: first.source_block_id,
              targetIds: group.sort((left, right) => left.target_order - right.target_order)
                .map(row => row.target_id),
              topicId: first.topic_id,
            },
          })
        }
      }
    }
    const queueRank = (candidate: typeof candidates[number]): number => {
      if (candidate.row.phase === 'learning' && candidate.row.scheduled_days === 0)
        return 0
      if (candidate.row.phase === 'relearning' && candidate.row.scheduled_days === 0)
        return 0
      const policy = candidate.config.queuePolicy
      if (candidate.row.phase === 'learning' || candidate.row.phase === 'relearning') {
        return policy.interdayOrder === 'before-reviews' ? 10 : policy.interdayOrder === 'after-reviews' ? 30 : 20
      }
      if (candidate.row.phase === 'new')
        return policy.newReviewOrder === 'before-reviews' ? 10 : policy.newReviewOrder === 'after-reviews' ? 30 : 20
      return 20
    }
    return candidates
      .sort((left, right) => {
        const rankDifference = queueRank(left) - queueRank(right)
        if (rankDifference !== 0)
          return rankDifference
        if (left.row.phase === 'new' && right.row.phase === 'new') {
          if (left.config.queuePolicy.newGatherOrder === 'source') {
            return left.row.topic_order - right.row.topic_order
              || left.row.source_order - right.row.source_order
              || left.item.cardId.localeCompare(right.item.cardId)
          }
          const leftKey = deterministicOrderKey(currentStudyDay(now, left.config.queuePolicy.studyDayStartsAtHour), left.item.cardId)
          const rightKey = deterministicOrderKey(currentStudyDay(now, right.config.queuePolicy.studyDayStartsAtHour), right.item.cardId)
          return leftKey.localeCompare(rightKey)
        }
        if (left.row.phase === 'review'
          && right.row.phase === 'review'
          && left.config.queuePolicy.reviewOrder === 'retrievability'
          && right.config.queuePolicy.reviewOrder === 'retrievability') {
          if (left.row.last_review_at === null || right.row.last_review_at === null)
            throw new Error('Review queue item is missing its last Review time')
          const leftElapsedDays = Math.max(0, (now - left.row.last_review_at) / 86_400_000)
          const rightElapsedDays = Math.max(0, (now - right.row.last_review_at) / 86_400_000)
          const retrievabilityDifference = forgetting_curve(
            left.config.fsrsParameters,
            leftElapsedDays,
            left.row.stability,
          ) - forgetting_curve(
            right.config.fsrsParameters,
            rightElapsedDays,
            right.row.stability,
          )
          if (retrievabilityDifference !== 0)
            return retrievabilityDifference
        }
        return left.item.dueAt - right.item.dueAt
          || deterministicOrderKey(
            currentStudyDay(now, left.config.queuePolicy.studyDayStartsAtHour),
            left.item.cardId,
          ).localeCompare(deterministicOrderKey(
            currentStudyDay(now, right.config.queuePolicy.studyDayStartsAtHour),
            right.item.cardId,
          ))
      })
      .map(candidate => candidate.item)
      .slice(0, limit)
  }

  async getMaintenanceEstimate(): Promise<LearningMaintenanceEstimate> {
    const [cards, targets, events, optimizers] = await Promise.all([
      this.#database.get<CountRow>('SELECT COUNT(*) AS count FROM learning_cards WHERE active = 0'),
      this.#database.get<CountRow>('SELECT COUNT(*) AS count FROM learning_targets WHERE active = 0'),
      this.#database.get<CountRow>('SELECT COUNT(*) AS count FROM learning_review_events WHERE target_id IN (SELECT target_id FROM learning_targets WHERE active = 0)'),
      this.#database.get<CountRow>('SELECT COUNT(*) AS count FROM learning_optimizers WHERE status = \'archived\''),
    ])
    if (!cards || !targets || !events || !optimizers)
      throw new Error('Failed to count learning database maintenance scope')
    return {
      archivedOptimizers: optimizers.count,
      inactiveCards: cards.count,
      reviewEvents: events.count,
      targets: targets.count,
    }
  }

  async maintainDatabase(): Promise<LearningMaintenanceResult> {
    return this.#serializeWrite(async () => {
      const estimate = await this.getMaintenanceEstimate()
      const sync = await this.#syncState()
      const pending = await this.#database.get<CountRow>('SELECT COUNT(*) AS count FROM learning_sync_outbox')
      if (!pending)
        throw new Error('Failed to inspect pending learning sync changes')
      if (sync.last_server_sequence > 0 && pending.count > 0)
        throw new Error('Learning database maintenance requires a clean sync')
      const inactiveCards = await this.#database.all<{ card_id: string }>('SELECT card_id FROM learning_cards WHERE active = 0')
      const inactiveTargets = await this.#database.all<{ target_id: string }>(
        'SELECT t.target_id FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id WHERE t.active = 0 AND c.active = 1',
      )
      const archivedOptimizers = await this.#database.all<{ optimizer_id: string }>('SELECT optimizer_id FROM learning_optimizers WHERE status = \'archived\'')
      const now = Date.now()
      const generation = sync.last_server_sequence + 1
      const commands: DatabaseCommand[] = []
      for (const card of inactiveCards) {
        const tombstoneId = createUuidV7()
        commands.push(
          {
            parameters: [tombstoneId, card.card_id, generation, now],
            sql: 'INSERT INTO learning_purge_tombstones (tombstone_id, scope_kind, scope_id, generation, created_at) VALUES (?, \'card\', ?, ?, ?)',
          },
          syncMutationCommand('tombstone', tombstoneId, 'delete', {
            generation,
            scopeId: card.card_id,
            scopeKind: 'card',
            tombstoneId,
          }, now),
        )
      }
      for (const optimizer of archivedOptimizers) {
        const tombstoneId = createUuidV7()
        commands.push(
          {
            parameters: [tombstoneId, optimizer.optimizer_id, generation, now],
            sql: 'INSERT INTO learning_purge_tombstones (tombstone_id, scope_kind, scope_id, generation, created_at) VALUES (?, \'optimizer\', ?, ?, ?)',
          },
          syncMutationCommand('tombstone', tombstoneId, 'delete', {
            generation,
            scopeId: optimizer.optimizer_id,
            scopeKind: 'optimizer',
            tombstoneId,
          }, now),
        )
      }
      for (const target of inactiveTargets) {
        const tombstoneId = createUuidV7()
        commands.push(
          {
            parameters: [tombstoneId, target.target_id, generation, now],
            sql: 'INSERT INTO learning_purge_tombstones (tombstone_id, scope_kind, scope_id, generation, created_at) VALUES (?, \'target\', ?, ?, ?)',
          },
          syncMutationCommand('tombstone', tombstoneId, 'delete', {
            generation,
            scopeId: target.target_id,
            scopeKind: 'target',
            tombstoneId,
          }, now),
        )
      }
      commands.push(
        { sql: 'DELETE FROM learning_targets WHERE active = 0' },
        { sql: 'DELETE FROM learning_cards WHERE active = 0' },
        { sql: 'DELETE FROM learning_optimizers WHERE status = \'archived\'' },
      )
      await this.#database.batch(commands)
      const foreignKeyErrors = await this.#database.all<Record<string, unknown>>('PRAGMA foreign_key_check')
      if (foreignKeyErrors.length > 0)
        throw new Error('Learning database maintenance left foreign key violations')
      await this.#database.exec('VACUUM')
      return { ...estimate, vacuumed: true }
    })
  }

  async listPendingSyncChanges(limit = 250): Promise<readonly LearningSyncChange[]> {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new RangeError('Learning sync change limit must be a positive safe integer')
    const rows = await this.#database.all<{
      created_at: number
      entity_id: string
      entity_kind: LearningSyncChange['entityKind']
      mutation_id: string
      operation: LearningSyncChange['operation']
      payload_json: string
    }>(
      'SELECT mutation_id, entity_kind, entity_id, operation, payload_json, created_at FROM learning_sync_outbox ORDER BY created_at, mutation_id LIMIT ?',
      [limit],
    )
    return rows.map(row => ({
      createdAt: row.created_at,
      entityId: row.entity_id,
      entityKind: row.entity_kind,
      mutationId: row.mutation_id,
      operation: row.operation,
      payload: JSON.parse(row.payload_json) as unknown,
    }))
  }

  async acknowledgeSyncChanges(input: AcknowledgeLearningSyncInput): Promise<void> {
    if (!Number.isSafeInteger(input.serverSequence) || input.serverSequence < 0)
      throw new RangeError('Server sequence must be a non-negative safe integer')
    if (input.mutationIds.length === 0)
      return
    const mutationIds = [...new Set(input.mutationIds)]
    mutationIds.forEach(mutationId => assertNonEmpty(mutationId, 'Sync mutation id'))
    await this.#serializeWrite(async () => {
      const placeholders = mutationIds.map(() => '?').join(', ')
      const existing = await this.#database.get<CountRow>(
        `SELECT COUNT(*) AS count FROM learning_sync_outbox WHERE mutation_id IN (${placeholders})`,
        mutationIds,
      )
      if (!existing || existing.count !== mutationIds.length)
        throw new Error('Cannot acknowledge unknown learning sync mutations')
      await this.#database.batch([
        {
          parameters: mutationIds,
          sql: `DELETE FROM learning_sync_outbox WHERE mutation_id IN (${placeholders})`,
        },
        {
          parameters: [input.serverSequence],
          sql: 'UPDATE learning_sync_state SET last_server_sequence = MAX(last_server_sequence, ?) WHERE singleton = 1',
        },
      ])
    })
  }
}

function toLearningStateObject(state: PersistedLearningState): LearningState {
  const { stateHash: _, ...publicState } = state
  return publicState
}

export async function createLearningStorage(database: EditorStorageDatabase): Promise<LearningStorage> {
  return DefaultLearningStorage.create(database)
}
