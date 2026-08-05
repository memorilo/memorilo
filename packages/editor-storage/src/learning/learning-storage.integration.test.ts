import type Database from 'better-sqlite3'
import type {
  DatabaseCommand,
  DatabaseValue,
  EditorStorage,
  EditorStorageDatabase,
  EmbeddingModel,
  LearningCardProjection,
} from '../index'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createEditorStorage,
  defaultLearningPracticeConfiguration,
  GLOBAL_OPTIMIZER_ID,
} from '../index'

function parameters(values: readonly DatabaseValue[] | undefined): readonly DatabaseValue[] {
  return values ?? []
}

class SqliteTestDatabase implements EditorStorageDatabase {
  readonly #database: Database.Database
  failNextBatch = false

  constructor(path = ':memory:') {
    this.#database = new BetterSqlite3(path)
    sqliteVec.load(this.#database)
  }

  async all<Row>(sql: string, values?: readonly DatabaseValue[]): Promise<readonly Row[]> {
    return this.#database.prepare(sql).all(...parameters(values)) as Row[]
  }

  async batch(commands: readonly DatabaseCommand[]): Promise<void> {
    const execute = this.#database.transaction(() => {
      for (const command of commands)
        this.#database.prepare(command.sql).run(...parameters(command.parameters))
      if (this.failNextBatch) {
        this.failNextBatch = false
        throw new Error('Injected batch failure')
      }
    })
    execute()
  }

  async close(): Promise<void> {
    this.#database.close()
  }

  async exec(sql: string): Promise<void> {
    this.#database.exec(sql)
  }

  async get<Row>(sql: string, values?: readonly DatabaseValue[]): Promise<Row | undefined> {
    return this.#database.prepare(sql).get(...parameters(values)) as Row | undefined
  }

  async run(sql: string, values?: readonly DatabaseValue[]): Promise<void> {
    this.#database.prepare(sql).run(...parameters(values))
  }
}

const embeddingModel: EmbeddingModel = {
  dimensions: 3,
  embedDocuments: async texts => texts.map(() => Float32Array.from([1, 0, 0])),
  embedQuery: async () => Float32Array.from([1, 0, 0]),
  id: 'test/learning-storage',
}

interface Harness {
  database: SqliteTestDatabase
  noteId: string
  storage: EditorStorage
}

const databases: SqliteTestDatabase[] = []
const temporaryDirectories: string[] = []

async function createHarness(path?: string): Promise<Harness> {
  const database = new SqliteTestDatabase(path)
  databases.push(database)
  const storage = await createEditorStorage({ database, embeddingModel })
  const note = await storage.openMostRecentNote()
  return { database, noteId: note.id, storage }
}

function basicCard(cardId: string, sourceBlockId = cardId): LearningCardProjection {
  return {
    cardId,
    direction: 'forward',
    itemBlockIds: [],
    kind: 'basic',
    sourceBlockId,
  }
}

async function reconcile(
  harness: Harness,
  cards: readonly LearningCardProjection[],
  topicId = 'topic',
): Promise<void> {
  await harness.storage.learning.reconcileTopicCards({
    cards,
    noteId: harness.noteId,
    topicId,
    topicOrder: 0,
  })
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.close()))
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    force: true,
    recursive: true,
  })))
})

describe('fSRS learning storage', () => {
  it('creates one editable fixed Global optimizer that cannot be archived', async () => {
    const { storage } = await createHarness()
    const global = await storage.learning.getOptimizer(GLOBAL_OPTIMIZER_ID)
    expect(global).toMatchObject({
      id: GLOBAL_OPTIMIZER_ID,
      isGlobal: true,
      name: 'Global',
      status: 'active',
    })

    const updated = await storage.learning.updateOptimizer({
      configuration: { ...global.configuration, desiredRetention: 0.93 },
      optimizerId: global.id,
    })
    expect(updated.configuration.desiredRetention).toBe(0.93)
    expect(updated.revisionId).not.toBe(global.revisionId)
    await expect(storage.learning.archiveOptimizer(global.id)).rejects.toThrow(
      'Global FSRS Optimizer cannot be archived',
    )
    await expect(storage.learning.renameOptimizer({
      name: 'Renamed Global',
      optimizerId: global.id,
    })).rejects.toThrow('Global FSRS Optimizer cannot be renamed')
  })

  it('preserves the exact state when an inactive CardID is restored', async () => {
    const harness = await createHarness()
    await reconcile(harness, [basicCard('card')])
    const [target] = await harness.storage.learning.listTargets('card')
    if (!target)
      throw new Error('Expected a Review Target for card')
    const rated = await harness.storage.learning.rateTarget({
      eventId: '018f0000-0000-7000-8000-000000000001',
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: target.targetId,
    })

    await reconcile(harness, [])
    expect(await harness.storage.learning.listTargets('card')).toEqual([
      { ...target, active: false },
    ])
    await reconcile(harness, [basicCard('card')])

    expect(await harness.storage.learning.getLearningState(target.targetId)).toEqual(rated.state)
    expect(await harness.storage.learning.listTargets('card')).toEqual([
      { ...target, active: true },
    ])
    const outboxBeforeNoop = await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_sync_outbox',
    )
    await reconcile(harness, [basicCard('card')])
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_sync_outbox',
    )).toEqual(outboxBeforeNoop)

    await reconcile(harness, [basicCard('card')], 'moved-topic')
    expect(await harness.storage.learning.getLearningState(target.targetId)).toEqual(rated.state)
    expect(await harness.storage.learning.listNoteTopicIds(harness.noteId)).toEqual(['moved-topic'])
  })

  it('uses item targets for forward List Cards and only Again activates Partial', async () => {
    const harness = await createHarness()
    await reconcile(harness, [{
      cardId: 'list-card',
      direction: 'forward',
      itemBlockIds: ['item-a', 'item-b'],
      kind: 'list',
      sourceBlockId: 'source',
    }])
    const targets = await harness.storage.learning.listTargets('list-card')
    const first = targets.find(target => target.itemBlockId === 'item-a')
    const second = targets.find(target => target.itemBlockId === 'item-b')
    if (!first || !second)
      throw new Error('Expected both List Card item targets')

    await harness.storage.learning.rateTarget({
      rating: 'hard',
      reviewedAt: 1_710_000_000_000,
      targetId: second.targetId,
    })
    expect((await harness.storage.learning.listTargets('list-card'))
      .find(target => target.targetId === second.targetId)
      ?.partialActive).toBe(false)

    const again = await harness.storage.learning.rateTarget({
      rating: 'again',
      reviewedAt: 1_710_000_001_000,
      targetId: first.targetId,
    })
    expect((await harness.storage.learning.listTargets('list-card'))
      .find(target => target.targetId === first.targetId)
      ?.partialActive).toBe(true)
    expect(await harness.storage.learning.listQueue({ now: again.state.dueAt })).toEqual([
      expect.objectContaining({
        cardId: 'list-card',
        presentation: 'partial',
        targetIds: [first.targetId],
      }),
    ])

    await harness.storage.learning.rateTarget({
      rating: 'easy',
      reviewedAt: again.state.dueAt,
      targetId: first.targetId,
    })
    const restoredTargets = await harness.storage.learning.listTargets('list-card')
    expect(restoredTargets.every(target => !target.partialActive)).toBe(true)
    const earliestDue = Math.min(...await Promise.all(restoredTargets.map(async target => (
      await harness.storage.learning.getLearningState(target.targetId)
    ).dueAt)))
    const learnAheadMilliseconds = defaultLearningPracticeConfiguration().queuePolicy.learnAheadMinutes * 60_000
    expect(await harness.storage.learning.listQueue({
      now: earliestDue - learnAheadMilliseconds - 1,
    })).toEqual([])
    expect(await harness.storage.learning.listQueue({ now: earliestDue })).toEqual([
      expect.objectContaining({
        cardId: 'list-card',
        presentation: 'full',
        targetIds: expect.arrayContaining([first.targetId, second.targetId]),
      }),
    ])
  })

  it('retains Review Events while undo and reset rebuild scheduling state', async () => {
    const harness = await createHarness()
    await reconcile(harness, [basicCard('card')])
    const [target] = await harness.storage.learning.listTargets('card')
    if (!target)
      throw new Error('Expected a Review Target for card')
    await harness.storage.learning.rateTarget({
      eventId: '018f0000-0000-7000-8000-000000000010',
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: target.targetId,
    })
    const undone = await harness.storage.learning.undoLastReview({
      eventId: '018f0000-0000-7000-8000-000000000011',
      targetId: target.targetId,
      undoneAt: 1_710_000_001_000,
    })
    expect(undone).toMatchObject({ phase: 'new', reps: 0, winningEventId: null })
    expect(await harness.storage.learning.undoLastReview({
      eventId: '018f0000-0000-7000-8000-000000000011',
      targetId: target.targetId,
      undoneAt: 1_710_000_001_000,
    })).toEqual(undone)

    await harness.storage.learning.rateTarget({
      eventId: '018f0000-0000-7000-8000-000000000012',
      rating: 'easy',
      reviewedAt: 1_710_000_002_000,
      targetId: target.targetId,
    })
    const reset = await harness.storage.learning.resetTarget({
      eventId: '018f0000-0000-7000-8000-000000000013',
      resetAt: 1_710_000_003_000,
      targetId: target.targetId,
    })
    expect(reset).toMatchObject({ phase: 'new', reps: 0, winningEventId: null })
    expect(await harness.storage.learning.resetTarget({
      eventId: '018f0000-0000-7000-8000-000000000013',
      resetAt: 1_710_000_003_000,
      targetId: target.targetId,
    })).toEqual(reset)
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_review_events WHERE target_id = ?',
      [target.targetId],
    )).toEqual({ count: 4 })
    expect(await harness.database.get<{ elapsed_days: number, scheduled_days: number }>(
      'SELECT scheduled_days, elapsed_days FROM learning_review_events WHERE event_id = ?',
      ['018f0000-0000-7000-8000-000000000012'],
    )).toEqual({ elapsed_days: 0, scheduled_days: 0 })
  })

  it('gathers new Cards in their source projection order', async () => {
    const harness = await createHarness()
    await reconcile(harness, [basicCard('z-card'), basicCard('a-card')])
    expect((await harness.storage.learning.listQueue({ now: Date.now() + 1_000 }))
      .map(item => item.cardId)).toEqual(['z-card', 'a-card'])
  })

  it('buries Cards that share a sourceBlockId until the next Study Day', async () => {
    const harness = await createHarness()
    await reconcile(harness, [
      basicCard('forward-card', 'shared-source'),
      basicCard('backward-card', 'shared-source'),
    ])
    const [target] = await harness.storage.learning.listTargets('forward-card')
    if (!target)
      throw new Error('Expected a forward sibling target')
    const reviewedAt = Date.now() + 1_000
    await harness.storage.learning.rateTarget({
      rating: 'easy',
      reviewedAt,
      targetId: target.targetId,
    })

    expect((await harness.storage.learning.listQueue({ now: reviewedAt }))
      .map(item => item.cardId)).not.toContain('backward-card')
    expect((await harness.storage.learning.listQueue({ now: reviewedAt + 2 * 86_400_000 }))
      .map(item => item.cardId)).toContain('backward-card')
  })

  it('keeps due unchanged on normal assignment but replays immediately when archiving an optimizer', async () => {
    const harness = await createHarness()
    await reconcile(harness, [basicCard('card')])
    const [target] = await harness.storage.learning.listTargets('card')
    if (!target)
      throw new Error('Expected a Review Target for card')
    const custom = await harness.storage.learning.createOptimizer({ name: 'Custom' })
    expect(await harness.storage.learning.renameOptimizer({
      name: 'Shared Custom',
      optimizerId: custom.id,
    })).toMatchObject({ id: custom.id, name: 'Shared Custom' })
    await harness.storage.learning.assignNoteOptimizer({
      noteId: harness.noteId,
      optimizerId: custom.id,
    })
    await harness.storage.learning.rateTarget({
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: target.targetId,
    })
    const beforeAssignment = await harness.storage.learning.getLearningState(target.targetId)
    expect(beforeAssignment.optimizerRevisionId).toBe(custom.revisionId)
    await harness.storage.learning.assignNoteOptimizer({
      noteId: harness.noteId,
      optimizerId: GLOBAL_OPTIMIZER_ID,
    })
    expect(await harness.storage.learning.getLearningState(target.targetId)).toEqual(beforeAssignment)

    await harness.storage.learning.archiveOptimizer(custom.id)
    const replayed = await harness.storage.learning.getLearningState(target.targetId)
    const global = await harness.storage.learning.getOptimizer(GLOBAL_OPTIMIZER_ID)
    expect(replayed.optimizerRevisionId).toBe(global.revisionId)
    expect(await harness.database.get<{ optimizer_id: string }>(
      'SELECT optimizer_id FROM learning_note_optimizer_assignments WHERE note_id = ?',
      [harness.noteId],
    )).toEqual({ optimizer_id: GLOBAL_OPTIMIZER_ID })
    expect((await harness.storage.learning.maintainDatabase()).archivedOptimizers).toBe(1)
  })

  it('trains an Optimizer from retained review history and creates a new revision', async () => {
    const harness = await createHarness()
    await reconcile(harness, [basicCard('card')])
    const [target] = await harness.storage.learning.listTargets('card')
    if (!target)
      throw new Error('Expected a Review Target for card')
    const custom = await harness.storage.learning.createOptimizer({ name: 'Trainer' })
    await harness.storage.learning.assignNoteOptimizer({
      noteId: harness.noteId,
      optimizerId: custom.id,
    })
    const firstReviewAt = Date.now()
    await harness.storage.learning.rateTarget({
      rating: 'good',
      reviewedAt: firstReviewAt,
      targetId: target.targetId,
    })
    await harness.storage.learning.rateTarget({
      rating: 'easy',
      reviewedAt: firstReviewAt + 86_400_000,
      targetId: target.targetId,
    })

    const optimized = await harness.storage.learning.optimizeOptimizer({
      optimizerId: custom.id,
      timeoutMilliseconds: 5_000,
    })
    expect(optimized.revisionId).not.toBe(custom.revisionId)
    expect(optimized.configuration.fsrsParameters).toHaveLength(21)
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_review_events WHERE target_id = ?',
      [target.targetId],
    )).toEqual({ count: 2 })
  }, 15_000)
})

describe('learning database maintenance', () => {
  it('purges an inactive item Target without deleting its active List Card siblings', async () => {
    const harness = await createHarness()
    const listCard = {
      cardId: 'list-card',
      direction: 'forward',
      itemBlockIds: ['kept-item', 'removed-item'],
      kind: 'list',
      sourceBlockId: 'source',
    } as const
    await reconcile(harness, [listCard])
    const targets = await harness.storage.learning.listTargets(listCard.cardId)
    const removed = targets.find(target => target.itemBlockId === 'removed-item')
    if (!removed)
      throw new Error('Expected the List item that will be removed')
    await harness.storage.learning.rateTarget({
      rating: 'again',
      reviewedAt: 1_710_000_000_000,
      targetId: removed.targetId,
    })
    await reconcile(harness, [{ ...listCard, itemBlockIds: ['kept-item'] }])

    expect(await harness.storage.learning.getMaintenanceEstimate()).toEqual({
      archivedOptimizers: 0,
      inactiveCards: 0,
      reviewEvents: 1,
      targets: 1,
    })
    await harness.storage.learning.maintainDatabase()
    expect((await harness.storage.learning.listTargets(listCard.cardId))
      .map(target => target.itemBlockId)).toEqual(['kept-item'])
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_purge_tombstones WHERE scope_kind = \'target\' AND scope_id = ?',
      [removed.targetId],
    )).toEqual({ count: 1 })
  })

  it('purges only inactive Card data, emits tombstones, and keeps active history intact', async () => {
    const harness = await createHarness()
    await reconcile(harness, [basicCard('active-card'), basicCard('inactive-card')])
    const [activeTarget] = await harness.storage.learning.listTargets('active-card')
    const [inactiveTarget] = await harness.storage.learning.listTargets('inactive-card')
    if (!activeTarget || !inactiveTarget)
      throw new Error('Expected both active and inactive test targets')
    await harness.storage.learning.rateTarget({
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: activeTarget.targetId,
    })
    await harness.storage.learning.rateTarget({
      rating: 'again',
      reviewedAt: 1_710_000_001_000,
      targetId: inactiveTarget.targetId,
    })
    await reconcile(harness, [basicCard('active-card')])

    expect(await harness.storage.learning.getMaintenanceEstimate()).toEqual({
      archivedOptimizers: 0,
      inactiveCards: 1,
      reviewEvents: 1,
      targets: 1,
    })
    expect(await harness.storage.learning.maintainDatabase()).toEqual({
      archivedOptimizers: 0,
      inactiveCards: 1,
      reviewEvents: 1,
      targets: 1,
      vacuumed: true,
    })
    expect(await harness.storage.learning.getLearningState(activeTarget.targetId)).toMatchObject({
      reps: 1,
      targetId: activeTarget.targetId,
    })
    expect(await harness.storage.learning.listTargets('inactive-card')).toEqual([])
    expect(await harness.database.all('PRAGMA foreign_key_check')).toEqual([])
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_purge_tombstones WHERE scope_kind = \'card\' AND scope_id = \'inactive-card\'',
    )).toEqual({ count: 1 })
    expect((await harness.storage.learning.listPendingSyncChanges(1000)).some(change => (
      change.entityKind === 'tombstone'
      && change.operation === 'delete'
      && (change.payload as { scopeId?: string }).scopeId === 'inactive-card'
    ))).toBe(true)
  })

  it('rolls back the complete purge batch when any maintenance command fails', async () => {
    const harness = await createHarness()
    await reconcile(harness, [basicCard('inactive-card')])
    const [target] = await harness.storage.learning.listTargets('inactive-card')
    if (!target)
      throw new Error('Expected an inactive test target')
    await harness.storage.learning.rateTarget({
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: target.targetId,
    })
    await reconcile(harness, [])
    harness.database.failNextBatch = true

    await expect(harness.storage.learning.maintainDatabase()).rejects.toThrow('Injected batch failure')
    expect(await harness.storage.learning.getMaintenanceEstimate()).toEqual({
      archivedOptimizers: 0,
      inactiveCards: 1,
      reviewEvents: 1,
      targets: 1,
    })
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_purge_tombstones',
    )).toEqual({ count: 0 })
  })

  it('refuses a synced database with unacknowledged learning changes', async () => {
    const harness = await createHarness()
    await reconcile(harness, [basicCard('inactive-card')])
    const initialChanges = await harness.storage.learning.listPendingSyncChanges(100)
    await harness.storage.learning.acknowledgeSyncChanges({
      mutationIds: initialChanges.map(change => change.mutationId),
      serverSequence: 1,
    })
    await reconcile(harness, [])

    await expect(harness.storage.learning.maintainDatabase()).rejects.toThrow(
      'Learning database maintenance requires a clean sync',
    )
    const pendingChanges = await harness.storage.learning.listPendingSyncChanges(100)
    await harness.storage.learning.acknowledgeSyncChanges({
      mutationIds: pendingChanges.map(change => change.mutationId),
      serverSequence: 2,
    })
    expect((await harness.storage.learning.maintainDatabase()).inactiveCards).toBe(1)
  })

  it('reopens cleanly after purging archived optimizers and vacuuming a file database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-learning-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'learning.sqlite')
    const harness = await createHarness(path)
    const archived = await harness.storage.learning.createOptimizer({ name: 'Archived' })
    await harness.storage.learning.archiveOptimizer(archived.id)
    expect((await harness.storage.learning.maintainDatabase()).archivedOptimizers).toBe(1)
    expect(await harness.database.all('PRAGMA foreign_key_check')).toEqual([])
    await harness.storage.close()
    databases.splice(databases.indexOf(harness.database), 1)

    const reopened = await createHarness(path)
    expect(await reopened.storage.learning.listOptimizers()).toEqual([
      expect.objectContaining({ id: GLOBAL_OPTIMIZER_ID, status: 'active' }),
    ])
    expect(await reopened.database.all('PRAGMA foreign_key_check')).toEqual([])
  })
})
