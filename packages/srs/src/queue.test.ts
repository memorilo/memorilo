import type { LearningQueueCandidate, SelectLearningQueueInput } from './types'
import { describe, expect, it } from 'vitest'
import {
  addStudyDays,
  defaultLearningPracticeConfiguration,
  defaultOptimizerConfiguration,
  queueKindForState,
  selectLearningQueue,
  studyDayBounds,
} from './index'

const now = new Date(2026, 0, 2, 12).getTime()
const optimizerConfiguration = {
  ...defaultOptimizerConfiguration(),
  enableFuzz: false,
}

function candidate(
  value: string,
  overrides: Partial<LearningQueueCandidate<string>> = {},
): LearningQueueCandidate<string> {
  return {
    cardId: value,
    dueAt: now,
    lastReviewAt: null,
    noteId: 'note',
    optimizerConfiguration,
    phase: 'new',
    scheduledDays: 0,
    sourceBlockId: value,
    sourceOrder: 0,
    stability: 0,
    topicOrder: 0,
    value,
    ...overrides,
  }
}

function select(
  candidates: readonly LearningQueueCandidate<string>[],
  overrides: Partial<SelectLearningQueueInput<string>> = {},
): readonly string[] {
  return selectLearningQueue({
    candidates,
    introducedCardIds: new Set<string>(),
    limit: 100,
    mode: 'mixed',
    now,
    policy: defaultLearningPracticeConfiguration().queuePolicy,
    remainingNewCards: 100,
    siblingBuryEvents: [],
    ...overrides,
  })
}

describe('learning queue admission', () => {
  it('charges every Card only once against the daily new-card limit', () => {
    expect(select([
      candidate('partial-a', { cardId: 'shared-card', sourceBlockId: 'shared-source' }),
      candidate('partial-b', { cardId: 'shared-card', sourceBlockId: 'shared-source' }),
      candidate('another-card', { sourceOrder: 1 }),
    ], { remainingNewCards: 1 })).toEqual(['partial-a', 'partial-b'])
  })

  it('keeps introduced New Cards after the daily limit is exhausted', () => {
    expect(select([
      candidate('introduced'),
      candidate('unseen', { sourceOrder: 1 }),
      candidate('review', {
        lastReviewAt: now - 86_400_000,
        phase: 'review',
        scheduledDays: 1,
        sourceOrder: 2,
      }),
    ], {
      introducedCardIds: new Set(['introduced']),
      remainingNewCards: 0,
    })).toEqual(['review', 'introduced'])
  })

  it('applies the requested queue limit after ordering', () => {
    expect(select([
      candidate('third', { dueAt: now - 1, phase: 'review' }),
      candidate('first', { dueAt: now - 3, phase: 'review' }),
      candidate('second', { dueAt: now - 2, phase: 'review' }),
    ], { limit: 2 })).toEqual(['first', 'second'])
  })
})

describe('study day boundaries', () => {
  it('uses the previous boundary before the configured start hour', () => {
    const beforeBoundary = new Date(2026, 0, 2, 3, 59).getTime()
    const afterBoundary = new Date(2026, 0, 2, 4).getTime()

    expect(studyDayBounds(beforeBoundary, 4)).toEqual({
      endsAt: new Date(2026, 0, 2, 4).getTime(),
      startedAt: new Date(2026, 0, 1, 4).getTime(),
    })
    expect(studyDayBounds(afterBoundary, 4)).toEqual({
      endsAt: new Date(2026, 0, 3, 4).getTime(),
      startedAt: afterBoundary,
    })
  })

  it('adds calendar days across a daylight-saving transition', () => {
    const previousTimezone = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      const startedAt = new Date(2026, 2, 7, 4).getTime()
      const nextDay = new Date(2026, 2, 8, 4).getTime()

      expect(addStudyDays(startedAt, 1)).toBe(nextDay)
      expect(nextDay - startedAt).toBe(23 * 60 * 60_000)
    }
    finally {
      if (previousTimezone === undefined)
        delete process.env.TZ
      else
        process.env.TZ = previousTimezone
    }
  })
})

describe('learning queue classification and eligibility', () => {
  it('classifies every FSRS phase using Anki queue categories', () => {
    expect(queueKindForState({ phase: 'new', scheduledDays: 0 })).toBe('new')
    expect(queueKindForState({ phase: 'review', scheduledDays: 12 })).toBe('review')
    expect(queueKindForState({ phase: 'learning', scheduledDays: 0 })).toBe('intraday-learning')
    expect(queueKindForState({ phase: 'relearning', scheduledDays: 1 })).toBe('interday-learning')
  })

  it('uses learn-ahead only when no item is currently due', () => {
    const learnAhead = candidate('learn-ahead', {
      dueAt: now + 10 * 60_000,
      phase: 'learning',
      scheduledDays: 0,
    })
    const due = candidate('due', {
      lastReviewAt: now - 86_400_000,
      phase: 'review',
      scheduledDays: 1,
    })

    expect(select([learnAhead])).toEqual(['learn-ahead'])
    expect(select([learnAhead, due])).toEqual(['due'])
  })

  it('excludes future non-intraday and out-of-window intraday items', () => {
    const { endsAt } = studyDayBounds(now, 4)

    expect(select([
      candidate('future-review', { dueAt: now + 1, phase: 'review', scheduledDays: 2 }),
      candidate('future-interday', { dueAt: now + 1, phase: 'learning', scheduledDays: 1 }),
      candidate('future-intraday', {
        dueAt: now + 60 * 60_000,
        phase: 'learning',
        scheduledDays: 0,
      }),
      candidate('tomorrow-intraday', {
        dueAt: endsAt,
        phase: 'relearning',
        scheduledDays: 0,
      }),
    ])).toEqual([])
  })

  it('filters New and non-New queues by mode', () => {
    const candidates = [
      candidate('new'),
      candidate('review', {
        lastReviewAt: now - 86_400_000,
        phase: 'review',
        scheduledDays: 1,
      }),
    ]

    expect(select(candidates, { mode: 'new' })).toEqual(['new'])
    expect(select(candidates, { mode: 'review' })).toEqual(['review'])
  })
})

describe('learning queue ordering', () => {
  const orderedQueues = [
    candidate('intraday', { dueAt: now - 4, phase: 'learning', scheduledDays: 0 }),
    candidate('interday', { dueAt: now - 2, phase: 'learning', scheduledDays: 1 }),
    candidate('review', {
      dueAt: now - 3,
      lastReviewAt: now - 86_400_000,
      phase: 'review',
      scheduledDays: 1,
    }),
    candidate('new', { dueAt: now - 1 }),
  ]

  it.each([
    ['before-reviews', ['intraday', 'interday', 'review', 'new']],
    ['after-reviews', ['intraday', 'review', 'interday', 'new']],
    ['mixed', ['intraday', 'review', 'interday', 'new']],
  ] as const)('places interday learning %s', (interdayOrder, expected) => {
    const policy = {
      ...defaultLearningPracticeConfiguration().queuePolicy,
      interdayOrder,
    }

    expect(select(orderedQueues, { policy })).toEqual(expected)
  })

  it('gathers New Cards by Topic, source, then Card id', () => {
    expect(select([
      candidate('later-topic', { cardId: 'd', topicOrder: 1 }),
      candidate('later-source', { cardId: 'c', sourceOrder: 1 }),
      candidate('later-card', { cardId: 'z' }),
      candidate('earlier-card', { cardId: 'a' }),
    ])).toEqual(['earlier-card', 'later-card', 'later-source', 'later-topic'])
  })

  it('uses a deterministic per-day random order for New Cards', () => {
    const policy = {
      ...defaultLearningPracticeConfiguration().queuePolicy,
      newGatherOrder: 'random' as const,
    }
    const candidates = [candidate('a'), candidate('b'), candidate('c')]
    const first = select(candidates, { policy })
    const second = select([...candidates].reverse(), { policy })

    expect(second).toEqual(first)
    expect(new Set(first)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('orders Reviews by due time with a deterministic tie breaker', () => {
    const tied = [
      candidate('tie-a', { cardId: 'a', dueAt: now - 2, phase: 'review' }),
      candidate('tie-b', { cardId: 'b', dueAt: now - 2, phase: 'review' }),
    ]
    const first = select([
      candidate('later', { dueAt: now - 1, phase: 'review' }),
      candidate('earlier', { dueAt: now - 3, phase: 'review' }),
      ...tied,
    ])
    const second = select([...tied].reverse())

    expect(first[0]).toBe('earlier')
    expect(first.at(-1)).toBe('later')
    expect(second).toEqual(select(tied))
  })

  it('orders Reviews by lowest retrievability before due-time fallback', () => {
    const policy = {
      ...defaultLearningPracticeConfiguration().queuePolicy,
      reviewOrder: 'retrievability' as const,
    }
    const shared = {
      phase: 'review' as const,
      scheduledDays: 1,
    }

    expect(select([
      candidate('fresh', {
        ...shared,
        lastReviewAt: now - 86_400_000,
        stability: 10,
      }),
      candidate('forgotten', {
        ...shared,
        lastReviewAt: now - 10 * 86_400_000,
        stability: 1,
      }),
    ], { policy })).toEqual(['forgotten', 'fresh'])

    expect(select([
      candidate('later-due', {
        ...shared,
        dueAt: now - 1,
        lastReviewAt: now - 86_400_000,
        stability: 5,
      }),
      candidate('earlier-due', {
        ...shared,
        dueAt: now - 2,
        lastReviewAt: now - 86_400_000,
        stability: 5,
      }),
    ], { policy })).toEqual(['earlier-due', 'later-due'])
  })

  it('rejects Reviews without a last Review time in retrievability order', () => {
    const policy = {
      ...defaultLearningPracticeConfiguration().queuePolicy,
      reviewOrder: 'retrievability' as const,
    }
    const valid = candidate('valid', {
      lastReviewAt: now - 86_400_000,
      phase: 'review',
      stability: 1,
    })
    const missing = candidate('missing', { phase: 'review', stability: 1 })

    expect(() => select([missing, valid], { policy })).toThrow(
      new Error('Review queue item is missing its last Review time'),
    )
    expect(() => select([valid, missing], { policy })).toThrow(
      new Error('Review queue item is missing its last Review time'),
    )
  })
})

describe('sibling bury', () => {
  const noBury = {
    ...defaultLearningPracticeConfiguration().queuePolicy,
    buryInterdayLearningSiblings: false,
    buryNewSiblings: false,
    buryReviewSiblings: false,
  }

  it('keeps every sibling when all three bury options are disabled', () => {
    const shared = { noteId: 'note', sourceBlockId: 'shared' }

    expect(select([
      candidate('interday', { ...shared, phase: 'learning', scheduledDays: 1 }),
      candidate('review', { ...shared, phase: 'review', scheduledDays: 1 }),
      candidate('new', shared),
    ], { policy: noBury })).toEqual(['interday', 'review', 'new'])
  })

  it('never buries intraday learning siblings during collection', () => {
    const shared = {
      noteId: 'note',
      phase: 'learning' as const,
      scheduledDays: 0,
      sourceBlockId: 'shared',
    }

    expect(select([
      candidate('first', { ...shared, dueAt: now - 2 }),
      candidate('second', { ...shared, dueAt: now - 1 }),
    ])).toEqual(['first', 'second'])
  })

  it.each([
    ['buryInterdayLearningSiblings', 'learning', 1],
    ['buryReviewSiblings', 'review', 1],
    ['buryNewSiblings', 'new', 0],
  ] as const)('applies %s independently', (flag, phase, scheduledDays) => {
    const policy = { ...noBury, [flag]: true }
    const shared = { noteId: 'note', phase, scheduledDays, sourceBlockId: 'shared' }

    expect(select([
      candidate('first', { ...shared, cardId: 'a', dueAt: now - 2 }),
      candidate('second', { ...shared, cardId: 'b', dueAt: now - 1 }),
    ], { policy })).toEqual(['first'])
  })

  it('uses the source queue of a Rating to bury only later queue categories', () => {
    const shared = { noteId: 'note', sourceBlockId: 'shared' }
    const interday = candidate('interday', { ...shared, phase: 'learning', scheduledDays: 1 })
    const review = candidate('review', { ...shared, phase: 'review', scheduledDays: 1 })
    const newCard = candidate('new', shared)
    const event = (sourceQueue: 'interday-learning' | 'intraday-learning' | 'new' | 'review') => ({
      noteId: 'note',
      sourceBlockId: 'shared',
      sourceCardId: 'rated-card',
      sourceQueue,
    })

    expect(select([interday], { siblingBuryEvents: [event('new')] })).toEqual(['interday'])
    expect(select([review], { siblingBuryEvents: [event('new')] })).toEqual(['review'])
    expect(select([newCard], { siblingBuryEvents: [event('new')] })).toEqual([])
    expect(select([interday], { siblingBuryEvents: [event('review')] })).toEqual(['interday'])
    expect(select([review], { siblingBuryEvents: [event('review')] })).toEqual([])
    expect(select([newCard], { siblingBuryEvents: [event('review')] })).toEqual([])
    expect(select([interday], { siblingBuryEvents: [event('interday-learning')] })).toEqual([])
    expect(select([review], { siblingBuryEvents: [event('intraday-learning')] })).toEqual([])
  })

  it('does not bury the rated Card itself and groups repeated Rating events', () => {
    const self = candidate('self', {
      cardId: 'self-card',
      noteId: 'note',
      sourceBlockId: 'shared',
    })
    const siblingBuryEvents = [
      {
        noteId: 'note',
        sourceBlockId: 'shared',
        sourceCardId: 'self-card',
        sourceQueue: 'new' as const,
      },
      {
        noteId: 'note',
        sourceBlockId: 'shared',
        sourceCardId: 'another-card',
        sourceQueue: 'review' as const,
      },
    ]

    expect(select([self], { siblingBuryEvents: [siblingBuryEvents[0]!] })).toEqual(['self'])
    expect(select([self], { siblingBuryEvents })).toEqual([])
  })
})
