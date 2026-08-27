import { afterEach, describe, expect, it } from 'vitest'
import { basicCard, LearningStorageTestFixtures, reconcile } from './learning-storage-test-fixture'

const fixtures = new LearningStorageTestFixtures()

afterEach(() => fixtures.closeAll())

describe('reading Item storage', () => {
  it('preserves scheduling state on projection edits and deletes missing Highlights', async () => {
    const harness = await fixtures.create()
    const item = {
      highlightId: 'highlight-a',
      readingItemId: 'highlight-a',
      sourceBlockId: 'block-a',
      topicId: 'topic-a',
    }
    await harness.storage.learning.readingItems.reconcile(harness.noteId, 'topic-a', [item])
    const processed = await harness.storage.learning.readingItems.process({
      action: 'next',
      processedAt: 1_710_000_000_000,
      readingItemId: item.readingItemId,
      readPoint: 7,
    })

    await harness.storage.learning.readingItems.reconcile(harness.noteId, 'topic-a', [{ ...item, priority: 5 }])
    expect(await harness.storage.learning.readingItems.list({ now: processed.nextProcessAt ?? 0 })).toEqual([
      { ...processed, priority: 5 },
    ])

    await harness.storage.learning.readingItems.reconcile(harness.noteId, 'topic-a', [])
    expect(await harness.storage.learning.readingItems.list({ now: Number.MAX_SAFE_INTEGER })).toEqual([])
  })

  it('fairly alternates Reading Items and Review Targets', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('card')])
    await harness.storage.learning.readingItems.reconcile(harness.noteId, 'topic', [{
      highlightId: 'highlight-a',
      readingItemId: 'highlight-a',
      sourceBlockId: 'block-a',
      topicId: 'topic',
    }, {
      highlightId: 'highlight-b',
      readingItemId: 'highlight-b',
      sourceBlockId: 'block-b',
      topicId: 'topic',
    }])
    const at = Date.now()
    await expect(harness.storage.learning.queue.nextKind({ noteId: harness.noteId, now: at })).resolves.toBe('reading')
    await harness.storage.learning.readingItems.process({ processedAt: at, readingItemId: 'highlight-a' })
    await expect(harness.storage.learning.queue.nextKind({ noteId: harness.noteId, now: at })).resolves.toBe('review')

    const [target] = await harness.storage.learning.cards.listTargets('card')
    if (!target)
      throw new Error('Expected Review Target')
    await harness.storage.learning.reviews.rateTarget({ rating: 'good', reviewedAt: at, targetId: target.targetId })
    await expect(harness.storage.learning.queue.nextKind({ noteId: harness.noteId, now: at })).resolves.toBe('reading')
  })

  it('keeps a fair session order after Reading and Review actions', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [basicCard('card-a'), basicCard('card-b'), basicCard('card-c')])
    await harness.storage.learning.readingItems.reconcile(harness.noteId, 'topic', ['a', 'b', 'c'].map(id => ({
      highlightId: `highlight-${id}`,
      readingItemId: `highlight-${id}`,
      sourceBlockId: `block-${id}`,
      topicId: 'topic',
    })))
    const at = Date.now()
    const initial = await harness.storage.learning.queue.list({ limit: 6, noteId: harness.noteId, now: at })
    expect(initial.map(item => item.kind)).toEqual(['reading', 'review', 'reading', 'review', 'reading', 'review'])

    const firstReading = initial[0]
    if (!firstReading || firstReading.kind !== 'reading')
      throw new Error('Expected the session to start with a Reading Item')
    await harness.storage.learning.readingItems.process({ processedAt: at, readingItemId: firstReading.readingItemId })
    const afterReading = await harness.storage.learning.queue.list({ limit: 5, noteId: harness.noteId, now: at })
    expect(afterReading.map(item => item.kind)).toEqual(['review', 'reading', 'review', 'reading', 'review'])

    const firstReview = afterReading[0]
    if (!firstReview || firstReview.kind !== 'review')
      throw new Error('Expected a Review Card after processing the Reading Item')
    const [target] = await harness.storage.learning.cards.listTargets(firstReview.cardId)
    if (!target)
      throw new Error('Expected the Review Card Target')
    await harness.storage.learning.reviews.rateTarget({ rating: 'good', reviewedAt: at + 1, targetId: target.targetId })
    const afterReview = await harness.storage.learning.queue.list({ limit: 4, noteId: harness.noteId, now: at + 1 })
    expect(afterReview.map(item => item.kind)).toEqual(['review', 'reading', 'review', 'reading'])
  })

  it('keeps Basic, Reverse, Cloze, List, and Set Cards in one fair session queue', async () => {
    const harness = await fixtures.create()
    await reconcile(harness, [
      basicCard('basic-card'),
      { cardId: 'reverse-card', direction: 'backward', itemBlockIds: [], kind: 'basic', sourceBlockId: 'reverse-source' },
      { cardId: 'cloze-card', direction: 'forward', itemBlockIds: [], kind: 'cloze', sourceBlockId: 'cloze-source' },
      { cardId: 'list-card', direction: 'forward', itemBlockIds: ['list-a', 'list-b'], kind: 'list', sourceBlockId: 'list-source' },
      { cardId: 'set-card', direction: 'forward', itemBlockIds: ['set-a', 'set-b'], kind: 'set', sourceBlockId: 'set-source' },
    ])
    await harness.storage.learning.readingItems.reconcile(harness.noteId, 'topic', [{
      highlightId: 'mixed-reading',
      readingItemId: 'mixed-reading',
      sourceBlockId: 'mixed-reading-source',
      topicId: 'topic',
    }])

    const queue = await harness.storage.learning.queue.list({ limit: 10, noteId: harness.noteId, now: Date.now() })
    expect(queue.map(item => item.kind)).toEqual(['reading', 'review', 'review', 'review', 'review', 'review'])
    const reviewIds = queue.filter(item => item.kind === 'review').map(item => item.cardId)
    expect(new Set(reviewIds)).toEqual(new Set(['basic-card', 'reverse-card', 'cloze-card', 'list-card', 'set-card']))
    const listItem = queue.find(item => item.kind === 'review' && item.cardId === 'list-card')
    const setItem = queue.find(item => item.kind === 'review' && item.cardId === 'set-card')
    if (!listItem || listItem.kind !== 'review' || !setItem || setItem.kind !== 'review')
      throw new Error('Expected List and Set Cards in the mixed queue')
    expect(listItem.targetIds).toHaveLength(2)
    expect(setItem.targetIds).toHaveLength(2)
  })
})
