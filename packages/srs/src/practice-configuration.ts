import type { LearningPracticeConfiguration } from './types'

const defaultQueuePolicy = {
  buryInterdayLearningSiblings: true,
  buryNewSiblings: true,
  buryReviewSiblings: true,
  interdayOrder: 'before-reviews',
  learnAheadMinutes: 20,
  maxNewCardsPerDay: 20,
  newGatherOrder: 'source',
  reviewOrder: 'due-random',
  studyDayStartsAtHour: 4,
} as const

export function defaultLearningPracticeConfiguration(): LearningPracticeConfiguration {
  return {
    dailyGoal: {
      fixedCards: 30,
      mode: 'spread-week',
    },
    queuePolicy: { ...defaultQueuePolicy },
  }
}

function assertNonNegativeInteger(value: number, description: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${description} must be a non-negative safe integer`)
}

export function validateLearningPracticeConfiguration(
  configuration: LearningPracticeConfiguration,
): LearningPracticeConfiguration {
  if (!configuration || typeof configuration !== 'object')
    throw new TypeError('Learning practice configuration must be an object')
  const { dailyGoal, queuePolicy } = configuration
  if (!dailyGoal || typeof dailyGoal !== 'object')
    throw new TypeError('Daily Goal configuration must be an object')
  if (!['all-due', 'fixed', 'spread-week'].includes(dailyGoal.mode))
    throw new TypeError(`Unsupported Daily Goal mode: ${String(dailyGoal.mode)}`)
  if (!Number.isSafeInteger(dailyGoal.fixedCards) || dailyGoal.fixedCards < 1)
    throw new RangeError('Fixed Daily Goal must be a positive safe integer')
  if (!queuePolicy || typeof queuePolicy !== 'object')
    throw new TypeError('Learning Queue policy must be an object')

  assertNonNegativeInteger(queuePolicy.learnAheadMinutes, 'Learn-ahead minutes')
  assertNonNegativeInteger(queuePolicy.maxNewCardsPerDay, 'New cards per day')
  if (!Number.isInteger(queuePolicy.studyDayStartsAtHour)
    || queuePolicy.studyDayStartsAtHour < 0
    || queuePolicy.studyDayStartsAtHour > 23) {
    throw new RangeError('Study day start hour must be between 0 and 23')
  }
  if (queuePolicy.newGatherOrder !== 'random' && queuePolicy.newGatherOrder !== 'source')
    throw new TypeError(`Unsupported new gather order: ${String(queuePolicy.newGatherOrder)}`)
  if (!['after-reviews', 'before-reviews', 'mixed'].includes(queuePolicy.interdayOrder))
    throw new TypeError(`Unsupported interday order: ${String(queuePolicy.interdayOrder)}`)
  if (queuePolicy.reviewOrder !== 'due-random' && queuePolicy.reviewOrder !== 'retrievability')
    throw new TypeError(`Unsupported review order: ${String(queuePolicy.reviewOrder)}`)
  for (const [name, value] of Object.entries({
    buryInterdayLearningSiblings: queuePolicy.buryInterdayLearningSiblings,
    buryNewSiblings: queuePolicy.buryNewSiblings,
    buryReviewSiblings: queuePolicy.buryReviewSiblings,
  })) {
    if (typeof value !== 'boolean')
      throw new TypeError(`${name} must be a boolean`)
  }

  return {
    dailyGoal: {
      fixedCards: dailyGoal.fixedCards,
      mode: dailyGoal.mode,
    },
    queuePolicy: {
      buryInterdayLearningSiblings: queuePolicy.buryInterdayLearningSiblings,
      buryNewSiblings: queuePolicy.buryNewSiblings,
      buryReviewSiblings: queuePolicy.buryReviewSiblings,
      interdayOrder: queuePolicy.interdayOrder,
      learnAheadMinutes: queuePolicy.learnAheadMinutes,
      maxNewCardsPerDay: queuePolicy.maxNewCardsPerDay,
      newGatherOrder: queuePolicy.newGatherOrder,
      reviewOrder: queuePolicy.reviewOrder,
      studyDayStartsAtHour: queuePolicy.studyDayStartsAtHour,
    },
  }
}
