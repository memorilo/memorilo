import type { FsrsOptimizerConfiguration, ReviewRating } from './types'
import { describe, expect, it } from 'vitest'
import {
  defaultOptimizerConfiguration,
  emptyLearningState,
  replayRatings,
  validateOptimizerConfiguration,
} from './index'

function withOverride(
  configuration: FsrsOptimizerConfiguration,
  key: keyof FsrsOptimizerConfiguration,
  value: unknown,
): FsrsOptimizerConfiguration {
  return { ...configuration, [key]: value } as FsrsOptimizerConfiguration
}

describe('fsrs configuration', () => {
  it('validates and defensively copies a complete configuration', () => {
    const configuration = defaultOptimizerConfiguration()
    const validated = validateOptimizerConfiguration(configuration)

    expect(validated).toEqual(configuration)
    expect(validated).not.toBe(configuration)
    expect(validated.fsrsParameters).not.toBe(configuration.fsrsParameters)
    expect(validated.learningSteps).not.toBe(configuration.learningSteps)
    expect(validated.relearningSteps).not.toBe(configuration.relearningSteps)
  })

  it('rejects invalid scalar parameters', () => {
    const configuration = defaultOptimizerConfiguration()

    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'desiredRetention',
      Number.NaN,
    ))).toThrow(new TypeError('Desired retention must be finite'))
    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'desiredRetention',
      0,
    ))).toThrow(new RangeError('Desired retention must be greater than 0 and no greater than 1'))
    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'desiredRetention',
      1.01,
    ))).toThrow(new RangeError('Desired retention must be greater than 0 and no greater than 1'))
    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'maximumIntervalDays',
      1.5,
    ))).toThrow(new RangeError('Maximum interval must be a positive integer'))
    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'maximumIntervalDays',
      0,
    ))).toThrow(new RangeError('Maximum interval must be a positive integer'))
    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'enableFuzz',
      'yes',
    ))).toThrow(new TypeError('Enable fuzz must be a boolean'))
  })

  it('rejects invalid FSRS weights and learning steps', () => {
    const configuration = defaultOptimizerConfiguration()

    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'fsrsParameters',
      'weights',
    ))).toThrow(new TypeError('FSRS parameters must be a non-empty array'))
    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'fsrsParameters',
      [],
    ))).toThrow(new TypeError('FSRS parameters must be a non-empty array'))
    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'fsrsParameters',
      [Number.POSITIVE_INFINITY],
    ))).toThrow(new TypeError('FSRS parameter 0 must be finite'))
    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'learningSteps',
      '10m',
    ))).toThrow(new TypeError('Learning steps must be an array'))
    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'learningSteps',
      ['01m'],
    ))).toThrow(new TypeError('Learning steps contains invalid step 01m'))
    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'relearningSteps',
      null,
    ))).toThrow(new TypeError('Relearning steps must be an array'))
    expect(() => validateOptimizerConfiguration(withOverride(
      configuration,
      'relearningSteps',
      ['1w'],
    ))).toThrow(new TypeError('Relearning steps contains invalid step 1w'))
  })
})

describe('fsrs Rating replay', () => {
  it.each([
    ['again', 'learning'],
    ['hard', 'learning'],
    ['good', 'learning'],
    ['easy', 'review'],
  ] as const)('maps %s to its resulting learning phase', (rating, phase) => {
    const reviewedAt = 1_710_000_000_000
    const state = replayRatings(
      'target',
      reviewedAt,
      'revision',
      { ...defaultOptimizerConfiguration(), enableFuzz: false },
      [{ eventId: rating, occurredAt: reviewedAt, rating }],
    )

    expect(state.phase).toBe(phase)
    expect(state.winningEventId).toBe(rating)
    expect(state.lastReviewAt).toBe(reviewedAt)
  })

  it('maps a lapse from Review into Relearning', () => {
    const createdAt = 1_710_000_000_000
    const ratings: readonly { eventId: string, occurredAt: number, rating: ReviewRating }[] = [
      { eventId: 'graduate', occurredAt: createdAt, rating: 'easy' },
      { eventId: 'lapse', occurredAt: createdAt + 86_400_000, rating: 'again' },
    ]

    expect(replayRatings(
      'target',
      createdAt,
      'revision',
      { ...defaultOptimizerConfiguration(), enableFuzz: false },
      ratings,
    ).phase).toBe('relearning')
  })

  it('keeps an empty replay in the New phase', () => {
    const createdAt = 1_710_000_000_000

    expect(replayRatings(
      'target',
      createdAt,
      'revision',
      defaultOptimizerConfiguration(),
      [],
    )).toEqual(emptyLearningState('target', createdAt, 'revision'))
  })
})
