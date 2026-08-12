import type { DesktopLearningApi, DesktopReviewItem } from '@memorilo/desktop-preload'
import type { PreparedReview, ReviewRating } from './learning-review-rating-model'
import { describe, expect, it, vi } from 'vitest'
import { createLearningReviewRatingModel } from './learning-review-rating-model'

function reviewResult(targetId: string, eventId: string) {
  return {
    eventId,
    state: {
      difficulty: 0,
      dueAt: 0,
      lapses: 0,
      lastReviewAt: null,
      learningSteps: 0,
      optimizerRevisionId: 'optimizer-revision',
      phase: 'review' as const,
      reps: 1,
      scheduledDays: 1,
      stability: 1,
      targetId,
      winningEventId: eventId,
    },
  }
}

function createRatingAdapter() {
  const rateMultiLineCard = vi.fn<DesktopLearningApi['rateMultiLineCard']>(async input => ({
    itemResults: input.itemRatings.map(item => reviewResult(item.targetId, `rated-${item.targetId}`)),
    mainResult: reviewResult(input.mainPreparation.targetId, `rated-${input.mainPreparation.targetId}`),
  }))
  const rateTarget = vi.fn<DesktopLearningApi['rateTarget']>(async input => (
    reviewResult(input.targetId, `rated-${input.targetId}`)
  ))
  const undoReviews = vi.fn<DesktopLearningApi['undoReviews']>(async input => (
    input.reviews.map(review => reviewResult(review.targetId, review.eventId).state)
  ))
  return {
    adapter: { rateMultiLineCard, rateTarget, undoReviews },
    rateMultiLineCard,
    rateTarget,
    undoReviews,
  }
}

function multiLineItem(kind: 'list' | 'set'): DesktopReviewItem {
  return {
    card: {
      blockHighlight: null,
      definitionId: 'definition',
      direction: 'forward',
      id: 'card',
      items: [
        { blockId: 'block-1', content: [] },
        { blockId: 'block-2', content: [] },
      ],
      kind,
      prompt: [],
      sourceBlockId: 'source',
    },
    mainTargetId: 'main-target',
    noteTitle: 'Note',
    queue: {
      cardId: 'card',
      dueAt: 0,
      noteId: 'note',
      phase: 'review',
      presentation: 'full',
      sourceBlockId: 'source',
      targetIds: ['item-target-1', 'item-target-2'],
      topicId: 'topic',
    },
    targets: [
      { itemBlockId: 'block-1', targetId: 'item-target-1' },
      { itemBlockId: 'block-2', targetId: 'item-target-2' },
    ],
    topicTitle: 'Topic',
    updatedAt: 0,
  }
}

function basicItem(): DesktopReviewItem {
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
    mainTargetId: 'main-target',
    noteTitle: 'Note',
    queue: {
      cardId: 'card',
      dueAt: 0,
      noteId: 'note',
      phase: 'review',
      presentation: 'full',
      sourceBlockId: 'source',
      targetIds: ['main-target'],
      topicId: 'topic',
    },
    targets: [{ itemBlockId: null, targetId: 'main-target' }],
    topicTitle: 'Topic',
    updatedAt: 0,
  }
}

function prepared(targetId: string, intervals: Record<ReviewRating, number> = {
  again: 1,
  easy: 4,
  good: 3,
  hard: 2,
}): PreparedReview {
  return {
    eventId: `event-${targetId}`,
    expectedOptimizerRevisionId: `optimizer-${targetId}`,
    expectedStateHash: `state-${targetId}`,
    expectedWinningEventId: `winning-${targetId}`,
    outcomes: {
      again: { intervalMilliseconds: intervals.again },
      easy: { intervalMilliseconds: intervals.easy },
      good: { intervalMilliseconds: intervals.good },
      hard: { intervalMilliseconds: intervals.hard },
    },
    reviewedAt: 100,
    targetId,
  }
}

function preparedMap(...targetIds: readonly string[]): ReadonlyMap<string, PreparedReview> {
  return new Map(targetIds.map(targetId => [targetId, prepared(targetId)]))
}

describe('learning review rating model', () => {
  it('advances a sequential List without committing until the final item', async () => {
    const { adapter, rateMultiLineCard, rateTarget } = createRatingAdapter()
    const ratingModel = createLearningReviewRatingModel(adapter, () => 100)
    const active = ratingModel.activate(multiLineItem('list'), { revealed: true })

    await expect(ratingModel.rate(active, 'hard', new Map())).resolves.toEqual({
      listRatings: ['hard'],
      nextTargetId: 'item-target-2',
      status: 'advance',
    })
    expect(rateMultiLineCard).not.toHaveBeenCalled()
    expect(rateTarget).not.toHaveBeenCalled()
  })

  it('commits the final sequential List item as one atomic multi-line Rating', async () => {
    const { adapter, rateMultiLineCard } = createRatingAdapter()
    let now = 100
    const undoIds = ['undo-1', 'undo-2', 'undo-main']
    const ratingModel = createLearningReviewRatingModel(adapter, () => now, () => {
      const id = undoIds.shift()
      if (!id)
        throw new Error('Missing test Undo Event id')
      return id
    })
    const active = ratingModel.activate(multiLineItem('list'), {
      listRatings: ['hard'],
      revealed: true,
      targetId: 'item-target-2',
    })
    now = 145

    await expect(ratingModel.rate(
      active,
      'good',
      preparedMap('item-target-1', 'item-target-2', 'main-target'),
    )).resolves.toEqual({
      status: 'committed',
      undoCommands: [
        { eventId: 'undo-1', expectedReviewEventId: 'rated-item-target-1', targetId: 'item-target-1' },
        { eventId: 'undo-2', expectedReviewEventId: 'rated-item-target-2', targetId: 'item-target-2' },
        { eventId: 'undo-main', expectedReviewEventId: 'rated-main-target', targetId: 'main-target' },
      ],
    })
    expect(rateMultiLineCard).toHaveBeenCalledOnce()
    expect(rateMultiLineCard).toHaveBeenCalledWith(expect.objectContaining({
      cardId: 'card',
      itemRatings: [
        expect.objectContaining({ rating: 'hard', responseMilliseconds: 45, targetId: 'item-target-1' }),
        expect.objectContaining({ rating: 'good', responseMilliseconds: 45, targetId: 'item-target-2' }),
      ],
      responseMilliseconds: 45,
    }))
  })

  it('downgrades forgotten Set items and interval projections to Again', async () => {
    const { adapter, rateMultiLineCard } = createRatingAdapter()
    const ratingModel = createLearningReviewRatingModel(adapter, () => 100)
    const active = ratingModel.toggleForgotten(
      ratingModel.activate(multiLineItem('set'), { revealed: true }),
      'block-2',
    )
    const preparations = preparedMap('item-target-1', 'item-target-2', 'main-target')

    expect(ratingModel.ratingIntervals(active, preparations, 'easy')).toEqual({ maximum: 4, minimum: 1 })
    await ratingModel.rate(active, 'easy', preparations)

    expect(rateMultiLineCard).toHaveBeenCalledWith(expect.objectContaining({
      itemRatings: [
        expect.objectContaining({ rating: 'easy', targetId: 'item-target-1' }),
        expect.objectContaining({ rating: 'again', targetId: 'item-target-2' }),
      ],
      setRating: 'easy',
    }))
  })

  it('passes one canonical preparation token to a single-target Rating', async () => {
    const { adapter, rateTarget } = createRatingAdapter()
    let now = 100
    const ratingModel = createLearningReviewRatingModel(adapter, () => now)
    const active = ratingModel.activate(basicItem(), { revealed: true })
    now = 125

    await ratingModel.rate(active, 'good', preparedMap('main-target'))

    expect(rateTarget).toHaveBeenCalledOnce()
    expect(rateTarget).toHaveBeenCalledWith({
      eventId: 'event-main-target',
      expectedOptimizerRevisionId: 'optimizer-main-target',
      expectedStateHash: 'state-main-target',
      expectedWinningEventId: 'winning-main-target',
      rating: 'good',
      responseMilliseconds: 25,
      reviewedAt: 100,
      targetId: 'main-target',
    })
  })

  it('replays the same immutable Undo command through the rating adapter', async () => {
    const { adapter, undoReviews } = createRatingAdapter()
    const ratingModel = createLearningReviewRatingModel(adapter)
    const commands = [{
      eventId: 'undo-main',
      expectedReviewEventId: 'rated-main',
      targetId: 'main-target',
    }]

    await ratingModel.undo(commands)
    await ratingModel.undo(commands)

    expect(undoReviews).toHaveBeenCalledTimes(2)
    expect(undoReviews).toHaveBeenNthCalledWith(1, { reviews: commands })
    expect(undoReviews).toHaveBeenNthCalledWith(2, { reviews: commands })
  })

  it('prepares every item and the main Target before the final List commit', () => {
    const { adapter } = createRatingAdapter()
    const ratingModel = createLearningReviewRatingModel(adapter)
    const active = ratingModel.activate(multiLineItem('list'), {
      listRatings: ['hard'],
      revealed: true,
      targetId: 'item-target-2',
    })

    const request = ratingModel.preparation(active, 2)
    expect(request?.targetIds).toEqual(['item-target-1', 'item-target-2', 'main-target'])
    expect(ratingModel.preparation({ ...active, sourceVisible: true }, 2)).toBe(request)
  })

  it('projects sequential visibility and revealed Set selection through one interface', () => {
    const { adapter } = createRatingAdapter()
    const ratingModel = createLearningReviewRatingModel(adapter)
    const list = ratingModel.activate(multiLineItem('list'))
    const set = ratingModel.activate(multiLineItem('set'), { revealed: true })

    expect(ratingModel.project(list)).toEqual({
      position: { current: 1, kind: 'sequential', total: 2 },
      supportsForgottenSelection: false,
      visibleItemBlockIds: [],
    })
    expect(ratingModel.project(set)).toEqual({
      position: { kind: 'phase', phase: 'review' },
      supportsForgottenSelection: true,
      visibleItemBlockIds: ['block-1', 'block-2'],
    })
  })
})
