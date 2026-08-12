import { afterEach, describe, expect, it } from 'vitest'
import { GLOBAL_OPTIMIZER_ID } from '../index'
import {
  basicCard,
  LearningStorageTestFixtures,
  reconcile,
} from './learning-storage-test-fixture'

const fixtures = new LearningStorageTestFixtures()

afterEach(() => fixtures.closeAll())

describe('fSRS learning optimizer storage', () => {
  it('creates one editable fixed Global optimizer that cannot be archived', async () => {
    const { storage } = await fixtures.create()
    const global = await storage.learning.optimizers.get(GLOBAL_OPTIMIZER_ID)
    expect(global).toMatchObject({
      id: GLOBAL_OPTIMIZER_ID,
      isGlobal: true,
      name: 'Global',
      status: 'active',
    })

    const updated = await storage.learning.optimizers.save({
      configuration: { ...global.configuration, desiredRetention: 0.93 },
      name: global.name,
      optimizerId: global.id,
    })
    expect(updated.configuration.desiredRetention).toBe(0.93)
    expect(updated.revisionId).not.toBe(global.revisionId)
    await expect(storage.learning.optimizers.archive(global.id)).rejects.toThrow(
      'Global FSRS Optimizer cannot be archived',
    )
    await expect(storage.learning.optimizers.save({
      configuration: updated.configuration,
      name: 'Renamed Global',
      optimizerId: global.id,
    })).rejects.toThrow('Global FSRS Optimizer cannot be renamed')
  })

  it('publishes optimizer name and scheduling configuration atomically', async () => {
    const harness = await fixtures.create()
    const optimizer = await harness.storage.learning.optimizers.create({ name: 'Original' })
    const input = {
      configuration: { ...optimizer.configuration, desiredRetention: 0.94 },
      name: 'Renamed',
      optimizerId: optimizer.id,
      rescheduleNow: false,
    }

    harness.database.failNextBatch = true
    await expect(harness.storage.learning.optimizers.save(input)).rejects.toThrow('Injected batch failure')

    expect(await harness.storage.learning.optimizers.get(optimizer.id)).toEqual(optimizer)

    const saved = await harness.storage.learning.optimizers.save(input)
    expect(saved).toMatchObject({
      configuration: { desiredRetention: 0.94 },
      id: optimizer.id,
      name: 'Renamed',
    })
    expect(saved.revisionId).not.toBe(optimizer.revisionId)
  })

  it('keeps due unchanged on normal assignment but replays immediately when archiving an optimizer', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('card')])
    const [target] = await harness.storage.learning.cards.listTargets('card')
    if (!target)
      throw new Error('Expected a Review Target for card')
    const custom = await harness.storage.learning.optimizers.create({ name: 'Custom' })
    expect(await harness.storage.learning.optimizers.save({
      configuration: custom.configuration,
      name: 'Shared Custom',
      optimizerId: custom.id,
    })).toMatchObject({ id: custom.id, name: 'Shared Custom' })
    await harness.storage.learning.optimizers.assignToNote({
      noteId: harness.noteId,
      optimizerId: custom.id,
    })
    await harness.storage.learning.reviews.rateTarget({
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: target.targetId,
    })
    const beforeAssignment = await harness.storage.learning.reviews.getState(target.targetId)
    expect(beforeAssignment.optimizerRevisionId).toBe(custom.revisionId)
    await harness.storage.learning.optimizers.assignToNote({
      noteId: harness.noteId,
      optimizerId: GLOBAL_OPTIMIZER_ID,
    })
    expect(await harness.storage.learning.reviews.getState(target.targetId)).toEqual(beforeAssignment)

    await harness.storage.learning.optimizers.archive(custom.id)
    const replayed = await harness.storage.learning.reviews.getState(target.targetId)
    const global = await harness.storage.learning.optimizers.get(GLOBAL_OPTIMIZER_ID)
    expect(replayed.optimizerRevisionId).toBe(global.revisionId)
    expect(await harness.database.get<{ optimizer_id: string }>(
      'SELECT optimizer_id FROM learning_note_optimizer_assignments WHERE note_id = ?',
      [harness.noteId],
    )).toEqual({ optimizer_id: GLOBAL_OPTIMIZER_ID })
    expect((await harness.storage.learning.maintenance.maintain()).archivedOptimizers).toBe(1)
  })

  it('trains an Optimizer from retained review history and creates a new revision', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('card')])
    const [target] = await harness.storage.learning.cards.listTargets('card')
    if (!target)
      throw new Error('Expected a Review Target for card')
    const custom = await harness.storage.learning.optimizers.create({ name: 'Trainer' })
    await harness.storage.learning.optimizers.assignToNote({
      noteId: harness.noteId,
      optimizerId: custom.id,
    })
    const firstReviewAt = Date.now()
    await harness.storage.learning.reviews.rateTarget({
      rating: 'good',
      reviewedAt: firstReviewAt,
      targetId: target.targetId,
    })
    await harness.storage.learning.reviews.rateTarget({
      rating: 'easy',
      reviewedAt: firstReviewAt + 86_400_000,
      targetId: target.targetId,
    })

    const optimized = await harness.storage.learning.optimizers.optimize({
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
