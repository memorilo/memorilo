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
    const at = 1_710_000_000_000
    await expect(harness.storage.learning.queue.nextKind({ noteId: harness.noteId, now: at })).resolves.toBe('reading')
    await harness.storage.learning.readingItems.process({ processedAt: at, readingItemId: 'highlight-a' })
    await expect(harness.storage.learning.queue.nextKind({ noteId: harness.noteId, now: at })).resolves.toBe('review')

    const [target] = await harness.storage.learning.cards.listTargets('card')
    if (!target)
      throw new Error('Expected Review Target')
    await harness.storage.learning.reviews.rateTarget({ rating: 'good', reviewedAt: at, targetId: target.targetId })
    await expect(harness.storage.learning.queue.nextKind({ noteId: harness.noteId, now: at })).resolves.toBe('reading')
  })
})
