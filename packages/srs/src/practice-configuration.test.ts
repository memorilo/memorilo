import type { LearningPracticeConfiguration } from './types'
import { describe, expect, it } from 'vitest'
import {
  defaultLearningPracticeConfiguration,
  validateLearningPracticeConfiguration,
} from './index'

function validateUnsafe(value: unknown): LearningPracticeConfiguration {
  return validateLearningPracticeConfiguration(value as LearningPracticeConfiguration)
}

function configurationWith(
  transform: (configuration: LearningPracticeConfiguration) => unknown,
): unknown {
  return transform(defaultLearningPracticeConfiguration())
}

describe('learning practice configuration validation', () => {
  it('returns a defensive copy and accepts every supported ordering value', () => {
    const configuration = defaultLearningPracticeConfiguration()
    const validated = validateLearningPracticeConfiguration(configuration)

    expect(validated).toEqual(configuration)
    expect(validated).not.toBe(configuration)
    expect(validated.dailyGoal).not.toBe(configuration.dailyGoal)
    expect(validated.queuePolicy).not.toBe(configuration.queuePolicy)

    for (const mode of ['all-due', 'fixed', 'spread-week'] as const) {
      expect(validateLearningPracticeConfiguration({
        ...configuration,
        dailyGoal: { fixedCards: 1, mode },
      }).dailyGoal.mode).toBe(mode)
    }
    for (const interdayOrder of ['after-reviews', 'before-reviews', 'mixed'] as const) {
      expect(validateLearningPracticeConfiguration({
        ...configuration,
        queuePolicy: { ...configuration.queuePolicy, interdayOrder },
      }).queuePolicy.interdayOrder).toBe(interdayOrder)
    }
    expect(validateLearningPracticeConfiguration({
      ...configuration,
      queuePolicy: {
        ...configuration.queuePolicy,
        newGatherOrder: 'random',
        reviewOrder: 'retrievability',
      },
    }).queuePolicy).toMatchObject({
      newGatherOrder: 'random',
      reviewOrder: 'retrievability',
    })
  })

  it('rejects malformed top-level and Daily Goal values', () => {
    expect(() => validateUnsafe(null)).toThrow(new TypeError('Learning practice configuration must be an object'))
    expect(() => validateUnsafe('configuration')).toThrow(new TypeError('Learning practice configuration must be an object'))
    expect(() => validateUnsafe(configurationWith(configuration => ({
      ...configuration,
      dailyGoal: null,
    })))).toThrow(new TypeError('Daily Goal configuration must be an object'))
    expect(() => validateUnsafe(configurationWith(configuration => ({
      ...configuration,
      dailyGoal: 1,
    })))).toThrow(new TypeError('Daily Goal configuration must be an object'))
    expect(() => validateUnsafe(configurationWith(configuration => ({
      ...configuration,
      dailyGoal: { fixedCards: 1, mode: 'weekends' },
    })))).toThrow(new TypeError('Unsupported Daily Goal mode: weekends'))
    expect(() => validateUnsafe(configurationWith(configuration => ({
      ...configuration,
      dailyGoal: { fixedCards: 1.5, mode: 'fixed' },
    })))).toThrow(new RangeError('Fixed Daily Goal must be a positive safe integer'))
    expect(() => validateUnsafe(configurationWith(configuration => ({
      ...configuration,
      dailyGoal: { fixedCards: 0, mode: 'fixed' },
    })))).toThrow(new RangeError('Fixed Daily Goal must be a positive safe integer'))
  })

  it('rejects malformed numeric Queue policy values', () => {
    expect(() => validateUnsafe(configurationWith(configuration => ({
      ...configuration,
      queuePolicy: null,
    })))).toThrow(new TypeError('Learning Queue policy must be an object'))
    expect(() => validateUnsafe(configurationWith(configuration => ({
      ...configuration,
      queuePolicy: 1,
    })))).toThrow(new TypeError('Learning Queue policy must be an object'))

    for (const [field, value, message] of [
      ['learnAheadMinutes', 1.5, 'Learn-ahead minutes'],
      ['learnAheadMinutes', -1, 'Learn-ahead minutes'],
      ['maxNewCardsPerDay', 1.5, 'New cards per day'],
      ['maxNewCardsPerDay', -1, 'New cards per day'],
    ] as const) {
      expect(() => validateUnsafe(configurationWith(configuration => ({
        ...configuration,
        queuePolicy: { ...configuration.queuePolicy, [field]: value },
      })))).toThrow(new RangeError(`${message} must be a non-negative safe integer`))
    }

    for (const hour of [1.5, -1, 24]) {
      expect(() => validateUnsafe(configurationWith(configuration => ({
        ...configuration,
        queuePolicy: { ...configuration.queuePolicy, studyDayStartsAtHour: hour },
      })))).toThrow(new RangeError('Study day start hour must be between 0 and 23'))
    }
  })

  it('rejects unsupported Queue orders and non-boolean bury flags', () => {
    for (const [field, value, message] of [
      ['newGatherOrder', 'alphabetical', 'Unsupported new gather order: alphabetical'],
      ['interdayOrder', 'tomorrow', 'Unsupported interday order: tomorrow'],
      ['reviewOrder', 'hardest', 'Unsupported review order: hardest'],
    ] as const) {
      expect(() => validateUnsafe(configurationWith(configuration => ({
        ...configuration,
        queuePolicy: { ...configuration.queuePolicy, [field]: value },
      })))).toThrow(new TypeError(message))
    }

    for (const field of [
      'buryInterdayLearningSiblings',
      'buryNewSiblings',
      'buryReviewSiblings',
    ] as const) {
      expect(() => validateUnsafe(configurationWith(configuration => ({
        ...configuration,
        queuePolicy: { ...configuration.queuePolicy, [field]: 'yes' },
      })))).toThrow(new TypeError(`${field} must be a boolean`))
    }
  })
})
