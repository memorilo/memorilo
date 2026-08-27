import { afterEach, describe, expect, it } from 'vitest'
import {
  basicCard,
  LearningStorageTestFixtures,
  reconcile,
} from './learning-storage-test-fixture'

const fixtures = new LearningStorageTestFixtures()

afterEach(() => fixtures.closeAll())

describe('fSRS learning review storage', () => {
  it('preserves the exact state when an inactive CardID is restored', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('card')])
    const [target] = await harness.storage.learning.cards.listTargets('card')
    if (!target)
      throw new Error('Expected a Review Target for card')
    const rated = await harness.storage.learning.reviews.rateTarget({
      eventId: '018f0000-0000-7000-8000-000000000001',
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: target.targetId,
    })

    await reconcile(harness, [])
    expect(await harness.storage.learning.cards.listTargets('card')).toEqual([
      { ...target, active: false },
    ])
    await reconcile(harness, [basicCard('card')])

    expect(await harness.storage.learning.reviews.getState(target.targetId)).toEqual(rated.state)
    expect(await harness.storage.learning.cards.listTargets('card')).toEqual([
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
    expect(await harness.storage.learning.reviews.getState(target.targetId)).toEqual(rated.state)
    expect(await harness.storage.learning.cards.listNoteTopicIds(harness.noteId)).toEqual(['moved-topic'])
  })

  it('schedules forward List Cards with a main Target and RemNote-style Partial items', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [{
      cardId: 'list-card',
      direction: 'forward',
      itemBlockIds: ['item-a', 'item-b'],
      kind: 'list',
      sourceBlockId: 'source',
    }])
    const targets = await harness.storage.learning.cards.listTargets('list-card')
    const main = targets.find(target => target.kind === 'whole')
    const first = targets.find(target => target.itemBlockId === 'item-a')
    const second = targets.find(target => target.itemBlockId === 'item-b')
    if (!main || !first || !second)
      throw new Error('Expected the List Card main Target and both item Targets')
    expect(targets).toHaveLength(3)

    const mainReview = await harness.storage.learning.reviews.rateTarget({
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: main.targetId,
    })

    await harness.storage.learning.reviews.rateTarget({
      rating: 'hard',
      reviewedAt: 1_710_000_000_000,
      targetId: second.targetId,
    })
    expect((await harness.storage.learning.cards.listTargets('list-card'))
      .find(target => target.targetId === second.targetId)
      ?.partialActive).toBe(true)

    const again = await harness.storage.learning.reviews.rateTarget({
      rating: 'again',
      reviewedAt: 1_710_000_001_000,
      targetId: first.targetId,
    })
    expect((await harness.storage.learning.cards.listTargets('list-card'))
      .find(target => target.targetId === first.targetId)
      ?.partialActive).toBe(true)
    expect(await harness.storage.learning.queue.list({ now: again.state.dueAt })).toEqual([
      expect.objectContaining({
        cardId: 'list-card',
        presentation: 'partial',
        targetIds: [first.targetId],
      }),
    ])

    const firstGood = await harness.storage.learning.reviews.rateTarget({
      rating: 'easy',
      reviewedAt: again.state.dueAt,
      targetId: first.targetId,
    })
    expect((await harness.storage.learning.cards.listTargets('list-card'))
      .find(target => target.targetId === first.targetId)
      ?.partialActive).toBe(true)

    await harness.storage.learning.reviews.rateTarget({
      rating: 'easy',
      reviewedAt: firstGood.state.dueAt,
      targetId: first.targetId,
    })
    expect((await harness.storage.learning.cards.listTargets('list-card'))
      .find(target => target.targetId === first.targetId)
      ?.partialActive).toBe(false)

    expect(await harness.storage.learning.queue.list({ now: mainReview.state.dueAt })).toEqual([
      expect.objectContaining({
        cardId: 'list-card',
        presentation: 'full',
        targetIds: [first.targetId, second.targetId],
      }),
    ])
  })

  it('commits a complete List repetition with item Ratings and one aggregated main Rating atomically', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [{
      cardId: 'list-card',
      direction: 'forward',
      itemBlockIds: ['item-a', 'item-b'],
      kind: 'list',
      sourceBlockId: 'source',
    }])
    const targets = await harness.storage.learning.cards.listTargets('list-card')
    const main = targets.find(target => target.kind === 'whole')
    const items = targets.filter(target => target.kind === 'item')
    if (!main || items.length !== 2)
      throw new Error('Expected one main Target and two List item Targets')
    const reviewedAt = 1_710_000_000_000
    const preparations = await Promise.all(targets.map(target => (
      harness.storage.learning.reviews.prepare({ reviewedAt, targetId: target.targetId })
    )))
    const preparationByTarget = new Map(preparations.map(preparation => [
      preparation.targetId,
      preparation,
    ]))
    const prepared = (targetId: string) => {
      const preparation = preparationByTarget.get(targetId)
      if (!preparation)
        throw new Error(`Missing preparation for Target ${targetId}`)
      const { outcomes: _outcomes, ...token } = preparation
      return token
    }
    const input = {
      cardId: 'list-card',
      itemRatings: [
        { ...prepared(items[0]!.targetId), rating: 'again' as const },
        { ...prepared(items[1]!.targetId), rating: 'good' as const },
      ],
      mainPreparation: prepared(main.targetId),
    }

    harness.database.failNextBatch = true
    await expect(harness.storage.learning.reviews.rateMultiLineCard(input)).rejects.toThrow('Injected batch failure')
    for (const target of targets) {
      expect(await harness.storage.learning.reviews.getState(target.targetId)).toMatchObject({
        phase: 'new',
        reps: 0,
        winningEventId: null,
      })
    }

    const result = await harness.storage.learning.reviews.rateMultiLineCard(input)
    expect(result.itemResults.map(item => item.state.targetId)).toEqual(items.map(item => item.targetId))
    expect(result.mainResult.state.targetId).toBe(main.targetId)
    expect(await harness.database.all<{ rating: string, target_id: string }>(
      'SELECT target_id, rating FROM learning_review_events ORDER BY target_id',
    )).toEqual(expect.arrayContaining([
      { rating: 'again', target_id: items[0]!.targetId },
      { rating: 'good', target_id: items[1]!.targetId },
      { rating: 'again', target_id: main.targetId },
    ]))
  })

  it('undoes a complete multi-line Rating atomically and idempotently', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [{
      cardId: 'list-card',
      direction: 'forward',
      itemBlockIds: ['item-a', 'item-b'],
      kind: 'list',
      sourceBlockId: 'source',
    }])
    const targets = await harness.storage.learning.cards.listTargets('list-card')
    const main = targets.find(target => target.kind === 'whole')
    const items = targets.filter(target => target.kind === 'item')
    if (!main || items.length !== 2)
      throw new Error('Expected one main Target and two List item Targets')
    const reviewedAt = 1_710_000_000_000
    const preparations = await Promise.all(targets.map(target => (
      harness.storage.learning.reviews.prepare({ reviewedAt, targetId: target.targetId })
    )))
    const preparationByTarget = new Map(preparations.map(preparation => [
      preparation.targetId,
      preparation,
    ]))
    const prepared = (targetId: string) => {
      const preparation = preparationByTarget.get(targetId)
      if (!preparation)
        throw new Error(`Missing preparation for Target ${targetId}`)
      const { outcomes: _outcomes, ...token } = preparation
      return token
    }
    const rated = await harness.storage.learning.reviews.rateMultiLineCard({
      cardId: 'list-card',
      itemRatings: [
        { ...prepared(items[0]!.targetId), rating: 'hard' },
        { ...prepared(items[1]!.targetId), rating: 'good' },
      ],
      mainPreparation: prepared(main.targetId),
    })
    const ratedEvents = [...rated.itemResults, rated.mainResult]
    const undoInput = {
      reviews: ratedEvents.map((review, index) => ({
        eventId: `018f0000-0000-7000-8000-00000000002${index}`,
        expectedReviewEventId: review.eventId,
        targetId: review.state.targetId,
      })),
      undoneAt: reviewedAt + 1_000,
    }

    harness.database.failNextBatch = true
    await expect(harness.storage.learning.reviews.undoMany(undoInput)).rejects.toThrow('Injected batch failure')
    for (const review of ratedEvents)
      expect(await harness.storage.learning.reviews.getState(review.state.targetId)).toEqual(review.state)
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_review_events WHERE event_kind = \'undo\'',
    )).toEqual({ count: 0 })

    const undone = await harness.storage.learning.reviews.undoMany(undoInput)
    expect(undone).toHaveLength(3)
    expect(undone).toEqual(expect.arrayContaining(targets.map(target => expect.objectContaining({
      phase: 'new',
      reps: 0,
      targetId: target.targetId,
      winningEventId: null,
    }))))
    await expect(harness.storage.learning.reviews.undoMany(undoInput)).resolves.toEqual(undone)
    expect(await harness.database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_review_events WHERE event_kind = \'undo\'',
    )).toEqual({ count: 3 })
  })

  it('retains Review Events while undo and reset rebuild scheduling state', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('card')])
    const [target] = await harness.storage.learning.cards.listTargets('card')
    if (!target)
      throw new Error('Expected a Review Target for card')
    await harness.storage.learning.reviews.rateTarget({
      eventId: '018f0000-0000-7000-8000-000000000010',
      rating: 'good',
      reviewedAt: 1_710_000_000_000,
      targetId: target.targetId,
    })
    const undone = await harness.storage.learning.reviews.undoLast({
      eventId: '018f0000-0000-7000-8000-000000000011',
      targetId: target.targetId,
      undoneAt: 1_710_000_001_000,
    })
    expect(undone).toMatchObject({ phase: 'new', reps: 0, winningEventId: null })
    expect(await harness.storage.learning.reviews.undoLast({
      eventId: '018f0000-0000-7000-8000-000000000011',
      targetId: target.targetId,
      undoneAt: 1_710_000_001_000,
    })).toEqual(undone)

    await harness.storage.learning.reviews.rateTarget({
      eventId: '018f0000-0000-7000-8000-000000000012',
      rating: 'easy',
      reviewedAt: 1_710_000_002_000,
      targetId: target.targetId,
    })
    const reset = await harness.storage.learning.reviews.resetTarget({
      eventId: '018f0000-0000-7000-8000-000000000013',
      resetAt: 1_710_000_003_000,
      targetId: target.targetId,
    })
    expect(reset).toMatchObject({ phase: 'new', reps: 0, winningEventId: null })
    expect(await harness.storage.learning.reviews.resetTarget({
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
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('z-card'), basicCard('a-card')])
    expect((await harness.storage.learning.queue.list({ now: Date.now() + 1_000 }))
      .filter(item => item.kind === 'review')
      .map(item => item.cardId)).toEqual(['z-card', 'a-card'])
  })

  it('aggregates daily progress from completed and newly introduced Cards', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('card')])
    const [target] = await harness.storage.learning.cards.listTargets('card')
    if (!target)
      throw new Error('Expected a daily progress target')
    const now = 1_710_000_000_000

    await expect(harness.storage.learning.queue.getDailyProgress(now)).resolves.toMatchObject({
      completedCards: 0,
      dailyGoalCards: 0,
      introducedNewCards: 0,
      remainingNewCards: 20,
    })

    await harness.storage.learning.reviews.rateTarget({
      rating: 'good',
      reviewedAt: now,
      targetId: target.targetId,
    })

    await expect(harness.storage.learning.queue.getDailyProgress(now)).resolves.toMatchObject({
      completedCards: 1,
      dailyGoalCards: 1,
      dueReviewCards: 0,
      introducedNewCards: 1,
      remainingNewCards: 19,
    })
  })

  it('buries Cards that share a sourceBlockId until the next Study Day', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [
      basicCard('forward-card', 'shared-source'),
      basicCard('backward-card', 'shared-source'),
    ])
    const [target] = await harness.storage.learning.cards.listTargets('forward-card')
    if (!target)
      throw new Error('Expected a forward sibling target')
    const reviewedAt = Date.now() + 1_000
    await harness.storage.learning.reviews.rateTarget({
      rating: 'easy',
      reviewedAt,
      targetId: target.targetId,
    })

    expect((await harness.storage.learning.queue.list({ now: reviewedAt }))
      .filter(item => item.kind === 'review')
      .map(item => item.cardId)).not.toContain('backward-card')
    expect((await harness.storage.learning.queue.list({ now: reviewedAt + 2 * 86_400_000 }))
      .filter(item => item.kind === 'review')
      .map(item => item.cardId)).toContain('backward-card')
  })
})
