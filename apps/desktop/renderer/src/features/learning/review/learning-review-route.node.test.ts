import type { DesktopReviewItem } from '@memorilo/desktop-api'
import type { ReadingItem } from '@memorilo/editor-storage'
import { describe, expect, it } from 'vitest'
import { learningReviewRoute } from './learning-review-route'

function reviewItem(): DesktopReviewItem {
  return {
    card: {
      back: [],
      blockHighlight: null,
      definitionId: 'definition',
      direction: 'forward',
      front: [],
      id: 'card',
      kind: 'basic',
      sourceBlockId: 'source',
    },
    mainTargetId: 'target',
    noteTitle: 'Note',
    queue: {
      cardId: 'card',
      dueAt: 0,
      noteId: 'note',
      phase: 'review',
      presentation: 'full',
      sourceBlockId: 'source',
      targetIds: ['target'],
      topicId: 'topic',
    },
    targets: [{ itemBlockId: null, targetId: 'target' }],
    topicTitle: 'Topic',
    updatedAt: 0,
  }
}

describe('learning review route', () => {
  it('round-trips a stable Reading Item position', () => {
    const item: ReadingItem = {
      highlightId: 'highlight',
      nextProcessAt: 123,
      noteId: 'note',
      priority: 0,
      readPoint: 2,
      readingItemId: 'reading-item',
      sourceBlockId: 'source',
      state: 'learning',
      topicId: 'topic',
    }
    const positioned = learningReviewRoute.readingPosition({ scope: 'note', scopeNoteId: 'note' }, item)
    expect(learningReviewRoute.validate(positioned)).toEqual(positioned)
    expect(learningReviewRoute.restoreReading(positioned)).toBe('reading-item')
  })

  it('round-trips a saved review position through one codec', () => {
    const positioned = learningReviewRoute.position(
      { scope: 'note', scopeNoteId: 'note' },
      reviewItem(),
      'target',
      ['hard', 'good'],
    )
    const validated = learningReviewRoute.validate(positioned)

    expect(validated).toEqual(positioned)
    expect(learningReviewRoute.restore(validated)).toEqual({
      cardId: 'card',
      noteId: 'note',
      presentation: 'full',
      targetId: 'target',
      topicId: 'topic',
    })
    expect(learningReviewRoute.savedRatings(validated)).toEqual(['hard', 'good'])
  })

  it('rejects partial identities and invalid saved ratings at validation', () => {
    expect(() => learningReviewRoute.validate({ cardId: 'card', scope: 'global' }))
      .toThrow('complete Card identity')
    expect(() => learningReviewRoute.validate({
      cardId: 'card',
      listRatings: 'almost',
      noteId: 'note',
      presentation: 'full',
      scope: 'global',
      targetId: 'target',
      topicId: 'topic',
    })).toThrow('Unsupported saved List Rating')
  })

  it('preserves only scope when clearing a saved position', () => {
    expect(learningReviewRoute.base({
      cardId: 'card',
      noteId: 'note',
      presentation: 'full',
      scope: 'note',
      scopeNoteId: 'note',
      targetId: 'target',
      topicId: 'topic',
    })).toEqual({ scope: 'note', scopeNoteId: 'note' })
  })
})
