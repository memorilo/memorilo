import { describe, expect, it } from 'vitest'
import {
  defaultLearningPracticeConfiguration,
  defaultOptimizerConfiguration,
  emptyLearningState,
  fingerprintRatingHistories,
  queueKindForState,
  replayRatings,
  selectLearningQueue,
  validateLearningPracticeConfiguration,
} from './index'

describe('srs queue classification', () => {
  it('classifies every scheduling state into the Anki collection queue', () => {
    expect(queueKindForState({ phase: 'new', scheduledDays: 0 })).toBe('new')
    expect(queueKindForState({ phase: 'review', scheduledDays: 10 })).toBe('review')
    expect(queueKindForState({ phase: 'learning', scheduledDays: 0 })).toBe('intraday-learning')
    expect(queueKindForState({ phase: 'relearning', scheduledDays: 1 })).toBe('interday-learning')
  })
})

describe('fsrs state replay', () => {
  it('rebuilds the persisted Learning State deterministically from Ratings', () => {
    const configuration = {
      ...defaultOptimizerConfiguration(),
      enableFuzz: false,
    }

    expect(emptyLearningState('target', 1_710_000_000_000, 'revision')).toEqual({
      difficulty: 0,
      dueAt: 1_710_000_000_000,
      lapses: 0,
      lastReviewAt: null,
      learningSteps: 0,
      optimizerRevisionId: 'revision',
      phase: 'new',
      reps: 0,
      scheduledDays: 0,
      stability: 0,
      stateHash: '037bb72e4bf4330fcff6bf983149202206bf377b34cb597aba9011f4c34c29ce',
      targetId: 'target',
      winningEventId: null,
    })
    expect(replayRatings(
      'target',
      1_710_000_000_000,
      'revision',
      configuration,
      [
        { eventId: 'event-1', occurredAt: 1_710_000_060_000, rating: 'good' },
        { eventId: 'event-2', occurredAt: 1_710_000_660_000, rating: 'easy' },
      ],
    )).toEqual({
      difficulty: 1,
      dueAt: 1_710_346_260_000,
      lapses: 0,
      lastReviewAt: 1_710_000_660_000,
      learningSteps: 0,
      optimizerRevisionId: 'revision',
      phase: 'review',
      reps: 2,
      scheduledDays: 4,
      stability: 3.94605407,
      stateHash: 'e11d379409e9f964c5800d2d6a3f6ca0cf10b53c7fe143b5d59bd6d841cedd52',
      targetId: 'target',
      winningEventId: 'event-2',
    })
  })
})

describe('fsrs parameter optimization', () => {
  it('fingerprints normalized Rating histories independently of target order', () => {
    const targetA = {
      ratings: [
        { eventId: 'event-a', occurredAt: 1_710_000_000_000, rating: 'good' as const },
        { eventId: 'event-b', occurredAt: 1_710_086_400_000, rating: 'again' as const },
      ],
      targetId: 'target-a',
    }
    const targetB = {
      ratings: [
        { eventId: 'event-c', occurredAt: 1_710_172_800_000, rating: 'easy' as const },
      ],
      targetId: 'target-b',
    }

    expect(fingerprintRatingHistories([targetB, targetA])).toBe(
      'e82a266f2525440ea73c50906c68d32c9c662ca0bcc35418e68cf51147887995',
    )
  })
})

describe('learning practice configuration', () => {
  it('owns and validates the complete default scheduling policy', () => {
    const defaults = defaultLearningPracticeConfiguration()

    expect(defaults).toEqual({
      dailyGoal: {
        fixedCards: 30,
        mode: 'spread-week',
      },
      queuePolicy: {
        buryInterdayLearningSiblings: true,
        buryNewSiblings: true,
        buryReviewSiblings: true,
        interdayOrder: 'before-reviews',
        learnAheadMinutes: 20,
        maxNewCardsPerDay: 20,
        newGatherOrder: 'source',
        reviewOrder: 'due-random',
        studyDayStartsAtHour: 4,
      },
    })
    expect(validateLearningPracticeConfiguration(defaults)).toEqual(defaults)
  })
})

describe('learning queue selection', () => {
  it('collects intraday learning before later queues when burying siblings', () => {
    const now = new Date(2026, 0, 2, 12).getTime()
    const configuration = { ...defaultOptimizerConfiguration(), enableFuzz: false }
    const policy = defaultLearningPracticeConfiguration().queuePolicy
    const candidate = (
      cardId: string,
      sourceBlockId: string,
      phase: 'learning' | 'new' | 'review',
      scheduledDays: number,
      dueAt = now,
    ) => ({
      cardId,
      dueAt,
      lastReviewAt: phase === 'review' ? now - 86_400_000 : null,
      noteId: 'note',
      optimizerConfiguration: configuration,
      phase,
      scheduledDays,
      sourceBlockId,
      sourceOrder: cardId.charCodeAt(0),
      stability: 3,
      topicOrder: 0,
      value: cardId,
    })

    expect(selectLearningQueue({
      candidates: [
        candidate('future-intraday', 'shared', 'learning', 0, now + 60 * 60_000),
        candidate('interday-sibling', 'shared', 'learning', 1),
        candidate('review-sibling', 'shared', 'review', 10),
        candidate('new-sibling', 'shared', 'new', 0),
        candidate('review', 'review-source', 'review', 10),
        candidate('new', 'new-source', 'new', 0),
      ],
      introducedCardIds: new Set<string>(),
      limit: 10,
      mode: 'mixed',
      now,
      policy,
      remainingNewCards: 10,
      siblingBuryEvents: [],
    })).toEqual(['review', 'new'])
  })
})
