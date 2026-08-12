import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GLOBAL_OPTIMIZER_ID } from '../index'
import {
  basicCard,
  LearningStorageTestFixtures,
  reconcile,
} from './learning-storage-test-fixture'

const fixtures = new LearningStorageTestFixtures()
const temporaryDirectories: string[] = []

afterEach(async () => {
  await fixtures.closeAll()
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, {
    force: true,
    recursive: true,
  })))
})

describe('learning database maintenance', () => {
  it('rejects Editor and Learning operations after their shared storage lifecycle closes', async () => {
    const harness = await fixtures.create()
    await harness.storage.close()

    await expect(harness.storage.learning.maintenance.getEstimate()).rejects.toThrow(
      'Editor storage is closed',
    )
    await expect(harness.storage.learning.optimizers.get(GLOBAL_OPTIMIZER_ID)).rejects.toThrow(
      'Editor storage is closed',
    )
    await expect(harness.storage.learning.optimizers.list()).rejects.toThrow(
      'Editor storage is closed',
    )
    await expect(harness.storage.learning.queue.getDailyProgress()).rejects.toThrow(
      'Editor storage is closed',
    )
    await expect(harness.storage.learning.queue.list()).rejects.toThrow(
      'Editor storage is closed',
    )
    await expect(harness.storage.learning.cards.listTargets('card')).rejects.toThrow(
      'Editor storage is closed',
    )
    await expect(harness.storage.learning.cards.listNoteTopicIds('note')).rejects.toThrow(
      'Editor storage is closed',
    )
    await expect(harness.storage.learning.cards.listNotesWithCards()).rejects.toThrow(
      'Editor storage is closed',
    )
    await expect(harness.storage.learning.sync.listPending()).rejects.toThrow(
      'Editor storage is closed',
    )
    await expect(harness.storage.learning.sync.acknowledge({
      mutationIds: [],
      serverSequence: 0,
    })).rejects.toThrow('Editor storage is closed')
    await expect(harness.storage.notes.listNoteIds()).rejects.toThrow('Editor storage is closed')
  })

  it('purges an inactive item Target without deleting its active List Card siblings', async () => {
    const harness = await fixtures.create()
    const listCard = {
      cardId: 'list-card',
      direction: 'forward',
      itemBlockIds: ['kept-item', 'removed-item'],
      kind: 'list',
      sourceBlockId: 'source',
    } as const
    await reconcile(harness, [listCard])
    const targets = await harness.storage.learning.cards.listTargets(listCard.cardId)
    const removed = targets.find(target => target.itemBlockId === 'removed-item')
    if (!removed)
      throw new Error('Expected the List item that will be removed')
    await harness.storage.learning.reviews.rateTarget({
      rating: 'again',
      reviewedAt: 1_710_000_000_000,
      targetId: removed.targetId,
    })
    await reconcile(harness, [{ ...listCard, itemBlockIds: ['kept-item'] }])

    expect(await harness.storage.learning.maintenance.getEstimate()).toEqual({
      archivedOptimizers: 0,
      inactiveCards: 0,
      reviewEvents: 1,
      targets: 1,
    })
    await harness.storage.learning.maintenance.maintain()
    expect((await harness.storage.learning.cards.listTargets(listCard.cardId))
      .map(target => target.itemBlockId)).toEqual([null, 'kept-item'])
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_purge_tombstones WHERE scope_kind = \'target\' AND scope_id = ?',
      [removed.targetId],
    )).toEqual({ count: 1 })
  })

  it('purges only inactive Card data, emits tombstones, and keeps active history intact', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('active-card'), basicCard('inactive-card')])
    const [activeTarget] = await harness.storage.learning.cards.listTargets('active-card')
    const [inactiveTarget] = await harness.storage.learning.cards.listTargets('inactive-card')
    if (!activeTarget || !inactiveTarget)
      throw new Error('Expected both active and inactive test targets')
    await harness.storage.learning.reviews.rateTarget({
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: activeTarget.targetId,
    })
    await harness.storage.learning.reviews.rateTarget({
      rating: 'again',
      reviewedAt: 1_710_000_001_000,
      targetId: inactiveTarget.targetId,
    })
    await reconcile(harness, [basicCard('active-card')])

    expect(await harness.storage.learning.maintenance.getEstimate()).toEqual({
      archivedOptimizers: 0,
      inactiveCards: 1,
      reviewEvents: 1,
      targets: 1,
    })
    expect(await harness.storage.learning.maintenance.maintain()).toEqual({
      archivedOptimizers: 0,
      inactiveCards: 1,
      reviewEvents: 1,
      targets: 1,
      vacuumed: true,
    })
    expect(await harness.storage.learning.reviews.getState(activeTarget.targetId)).toMatchObject({
      reps: 1,
      targetId: activeTarget.targetId,
    })
    expect(await harness.storage.learning.cards.listTargets('inactive-card')).toEqual([])
    expect(await harness.database.all('PRAGMA foreign_key_check')).toEqual([])
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_purge_tombstones WHERE scope_kind = \'card\' AND scope_id = \'inactive-card\'',
    )).toEqual({ count: 1 })
    expect((await harness.storage.learning.sync.listPending(1000)).some(change => (
      change.entityKind === 'tombstone'
      && change.operation === 'delete'
      && (change.payload as { scopeId?: string }).scopeId === 'inactive-card'
    ))).toBe(true)
  })

  it('rolls back the complete purge batch when any maintenance command fails', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('inactive-card')])
    const [target] = await harness.storage.learning.cards.listTargets('inactive-card')
    if (!target)
      throw new Error('Expected an inactive test target')
    await harness.storage.learning.reviews.rateTarget({
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: target.targetId,
    })
    await reconcile(harness, [])
    harness.database.failNextBatch = true

    await expect(harness.storage.learning.maintenance.maintain()).rejects.toThrow('Injected batch failure')
    expect(await harness.storage.learning.maintenance.getEstimate()).toEqual({
      archivedOptimizers: 0,
      inactiveCards: 1,
      reviewEvents: 1,
      targets: 1,
    })
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_purge_tombstones',
    )).toEqual({ count: 0 })
  })

  it('persists a vacuum retry after the purge transaction commits', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('inactive-card')])
    const [target] = await harness.storage.learning.cards.listTargets('inactive-card')
    if (!target)
      throw new Error('Expected an inactive test target')
    await harness.storage.learning.reviews.rateTarget({
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: target.targetId,
    })
    await reconcile(harness, [])
    harness.database.failNextVacuum = true

    await expect(harness.storage.learning.maintenance.maintain()).rejects.toThrow('Injected VACUUM failure')
    expect(await harness.storage.learning.maintenance.getEstimate()).toEqual({
      archivedOptimizers: 0,
      inactiveCards: 0,
      reviewEvents: 0,
      targets: 0,
    })
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_maintenance_state WHERE phase = \'vacuum-pending\'',
    )).toEqual({ count: 1 })

    await expect(harness.storage.learning.maintenance.maintain()).resolves.toEqual({
      archivedOptimizers: 0,
      inactiveCards: 1,
      reviewEvents: 1,
      targets: 1,
      vacuumed: true,
    })
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_maintenance_state',
    )).toEqual({ count: 0 })
  })

  it('refuses a synced database with unacknowledged learning changes', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('inactive-card')])
    const initialChanges = await harness.storage.learning.sync.listPending(100)
    await harness.storage.learning.sync.acknowledge({
      mutationIds: initialChanges.map(change => change.mutationId),
      serverSequence: 1,
    })
    await reconcile(harness, [])

    await expect(harness.storage.learning.maintenance.maintain()).rejects.toThrow(
      'Learning database maintenance requires a clean sync',
    )
    const pendingChanges = await harness.storage.learning.sync.listPending(100)
    await harness.storage.learning.sync.acknowledge({
      mutationIds: pendingChanges.map(change => change.mutationId),
      serverSequence: 2,
    })
    expect((await harness.storage.learning.maintenance.maintain()).inactiveCards).toBe(1)
  })

  it('reopens cleanly after purging archived optimizers and vacuuming a file database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-learning-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'learning.sqlite')
    const harness = await fixtures.create(path)
    const archived = await harness.storage.learning.optimizers.create({ name: 'Archived' })
    await harness.storage.learning.optimizers.archive(archived.id)
    expect((await harness.storage.learning.maintenance.maintain()).archivedOptimizers).toBe(1)
    expect(await harness.database.all('PRAGMA foreign_key_check')).toEqual([])
    await fixtures.close(harness)

    const reopened = await fixtures.create(path)
    expect(await reopened.storage.learning.optimizers.list()).toEqual([
      expect.objectContaining({ id: GLOBAL_OPTIMIZER_ID, status: 'active' }),
    ])
    expect(await reopened.database.all('PRAGMA foreign_key_check')).toEqual([])
  })
})
