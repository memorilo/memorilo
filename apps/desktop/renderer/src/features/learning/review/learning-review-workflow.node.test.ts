import type { DesktopLearningApi, DesktopReviewItem } from '@memorilo/desktop-api'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'
import { createLearningReviewWorkflow } from './learning-review-workflow'

function reviewItem(cardId: string, noteId = 'note'): DesktopReviewItem {
  const targetId = `${cardId}-target`
  return {
    card: {
      back: [],
      blockHighlight: null,
      definitionId: `${cardId}-definition`,
      direction: 'forward',
      front: [],
      id: cardId,
      kind: 'basic',
      sourceBlockId: `${cardId}-source`,
    },
    mainTargetId: targetId,
    noteTitle: noteId,
    queue: {
      cardId,
      dueAt: 0,
      noteId,
      phase: 'review',
      presentation: 'full',
      sourceBlockId: `${cardId}-source`,
      targetIds: [targetId],
      topicId: `${cardId}-topic`,
    },
    targets: [{ itemBlockId: null, targetId }],
    topicTitle: `${cardId}-topic`,
    updatedAt: 0,
  }
}

function reviewResult(targetId: string, eventId: string) {
  return {
    eventId,
    state: {
      difficulty: 0,
      dueAt: 0,
      lapses: 0,
      lastReviewAt: null,
      learningSteps: 0,
      optimizerRevisionId: 'optimizer',
      phase: 'review' as const,
      reps: 1,
      scheduledDays: 1,
      stability: 1,
      targetId,
      winningEventId: eventId,
    },
  }
}

function prepared(targetId: string): Awaited<ReturnType<DesktopLearningApi['prepareReview']>> {
  const outcomes = Object.fromEntries(
    (['again', 'hard', 'good', 'easy'] as const).map((rating, index) => [
      rating,
      {
        intervalMilliseconds: (index + 1) * 60_000,
        state: reviewResult(targetId, `prepared-${rating}`).state,
      },
    ]),
  ) as Awaited<ReturnType<DesktopLearningApi['prepareReview']>>['outcomes']
  return {
    eventId: `event-${targetId}`,
    expectedOptimizerRevisionId: `optimizer-${targetId}`,
    expectedStateHash: `state-${targetId}`,
    expectedWinningEventId: `winning-${targetId}`,
    outcomes,
    reviewedAt: 100,
    targetId,
  }
}

type LearningAdapterMethod
  = | 'getNextItem'
    | 'prepareReview'
    | 'rateMultiLineCard'
    | 'rateTarget'
    | 'restoreReviewItem'
    | 'undoReviews'

function adapter(overrides: Partial<Pick<DesktopLearningApi, LearningAdapterMethod>> = {}) {
  return {
    getNextItem: vi.fn<DesktopLearningApi['getNextItem']>(async () => null),
    prepareReview: vi.fn<DesktopLearningApi['prepareReview']>(async ({ targetId }) => prepared(targetId)),
    rateMultiLineCard: vi.fn<DesktopLearningApi['rateMultiLineCard']>(),
    rateTarget: vi.fn<DesktopLearningApi['rateTarget']>(async ({ targetId }) => reviewResult(targetId, `rated-${targetId}`)),
    restoreReviewItem: vi.fn<DesktopLearningApi['restoreReviewItem']>(async () => null),
    undoReviews: vi.fn<DesktopLearningApi['undoReviews']>(async () => []),
    ...overrides,
  }
}

describe('learning review workflow', () => {
  it('owns load, preparation, rating, history, and completion publication', async () => {
    const item = reviewItem('card')
    const getNextItem = vi.fn<DesktopLearningApi['getNextItem']>()
      .mockResolvedValueOnce(item)
      .mockResolvedValueOnce(null)
    const replaceRoute = vi.fn()
    const invalidateProgress = vi.fn()
    const workflow = createLearningReviewWorkflow({
      initialRoute: { scope: 'global' },
      invalidateProgress,
      learning: adapter({ getNextItem }),
      replaceRoute,
    })
    workflow.setRoute({ scope: 'global' })
    await vi.waitFor(() => expect(workflow.snapshot().view.status).toBe('active'))
    workflow.reveal()
    await vi.waitFor(() => expect(workflow.snapshot().ratingIntervals).not.toBeNull())
    await workflow.rate('good')

    expect(workflow.snapshot()).toMatchObject({
      actionError: null,
      actionPending: false,
      historyLength: 1,
      preparationError: null,
      scope: 'global',
      view: { status: 'complete' },
    })
    expect(invalidateProgress).toHaveBeenCalledOnce()
    expect(replaceRoute).toHaveBeenLastCalledWith({ scope: 'global' })
    await workflow.close()
  })

  it('lets an external route change supersede an accepted rating result', async () => {
    const first = reviewItem('first')
    const second = reviewItem('second', 'note-2')
    const rating = deferred<Awaited<ReturnType<DesktopLearningApi['rateTarget']>>>()
    const getNextItem = vi.fn<DesktopLearningApi['getNextItem']>(async input => (
      input?.noteId === 'note-2' ? second : first
    ))
    const rateTarget = vi.fn<DesktopLearningApi['rateTarget']>(() => rating.promise)
    const replaceRoute = vi.fn()
    const workflow = createLearningReviewWorkflow({
      initialRoute: { scope: 'global' },
      invalidateProgress: vi.fn(),
      learning: adapter({ getNextItem, rateTarget }),
      replaceRoute,
    })
    workflow.setRoute({ scope: 'global' })
    await vi.waitFor(() => expect(workflow.snapshot().view.status).toBe('active'))
    workflow.reveal()
    await vi.waitFor(() => expect(workflow.snapshot().ratingIntervals).not.toBeNull())

    const oldRating = workflow.rate('good')
    workflow.setRoute({ scope: 'note', scopeNoteId: 'note-2' })
    await vi.waitFor(() => {
      const current = workflow.snapshot().view
      expect(current.status === 'active' && current.item.queue.cardId === 'second').toBe(true)
    })
    rating.resolve(reviewResult('first-target', 'rated-first-target'))
    await oldRating

    expect(workflow.snapshot()).toMatchObject({
      historyLength: 0,
      scope: 'note',
      view: { status: 'active' },
    })
    const current = workflow.snapshot().view
    expect(current.status === 'active' ? current.item.queue.cardId : null).toBe('second')
    expect(replaceRoute).not.toHaveBeenCalledWith({ scope: 'global' })
    await workflow.close()
  })

  it('reports invalid restored positions through route state', async () => {
    const item = reviewItem('restored')
    const workflow = createLearningReviewWorkflow({
      initialRoute: { scope: 'global' },
      invalidateProgress: vi.fn(),
      learning: adapter({
        restoreReviewItem: vi.fn<DesktopLearningApi['restoreReviewItem']>(async () => item),
      }),
      replaceRoute: vi.fn(),
    })
    workflow.setRoute({
      cardId: 'restored',
      noteId: 'note',
      presentation: 'full',
      scope: 'global',
      targetId: 'missing-target',
      topicId: 'restored-topic',
    })
    await vi.waitFor(() => expect(workflow.snapshot().view.status).toBe('error'))

    expect(workflow.snapshot().view).toMatchObject({
      retry: 'route',
      status: 'error',
    })
    await workflow.close()
  })

  it('does not turn a committed rating into a failure when progress invalidation throws', async () => {
    const item = reviewItem('card')
    const getNextItem = vi.fn<DesktopLearningApi['getNextItem']>()
      .mockResolvedValueOnce(item)
      .mockResolvedValueOnce(null)
    const workflow = createLearningReviewWorkflow({
      initialRoute: { scope: 'global' },
      invalidateProgress: () => {
        throw new Error('query observer failed')
      },
      learning: adapter({ getNextItem }),
      replaceRoute: vi.fn(),
    })
    workflow.setRoute({ scope: 'global' })
    await vi.waitFor(() => expect(workflow.snapshot().view.status).toBe('active'))
    workflow.reveal()
    await vi.waitFor(() => expect(workflow.snapshot().ratingIntervals).not.toBeNull())
    await workflow.rate('good')

    expect(workflow.snapshot()).toMatchObject({
      actionError: null,
      historyLength: 1,
      view: { status: 'complete' },
    })
    await workflow.close()
  })

  it('owns subscriptions and rejects synchronous interaction after close', async () => {
    const item = reviewItem('card')
    const learning = adapter({
      getNextItem: vi.fn<DesktopLearningApi['getNextItem']>(async () => item),
    })
    const replaceRoute = vi.fn()
    const workflow = createLearningReviewWorkflow({
      initialRoute: { scope: 'global' },
      invalidateProgress: vi.fn(),
      learning,
      replaceRoute,
    })
    workflow.setRoute({ scope: 'global' })
    await vi.waitFor(() => expect(workflow.snapshot().view.status).toBe('active'))
    const beforeClose = workflow.snapshot()
    const listener = vi.fn()
    workflow.subscribe(listener)

    await workflow.close()
    workflow.setRoute({ scope: 'note', scopeNoteId: 'other-note' })
    workflow.reveal()
    workflow.retry()
    workflow.toggleForgotten('missing-item')
    workflow.toggleSource()
    const unsubscribeAfterClose = workflow.subscribe(listener)
    unsubscribeAfterClose()

    expect(workflow.snapshot()).toBe(beforeClose)
    expect(learning.getNextItem).toHaveBeenCalledOnce()
    expect(replaceRoute).toHaveBeenCalledOnce()
    expect(listener).not.toHaveBeenCalled()
  })
})
