import type { Card, FSRSParameters, Grade, StepUnit } from 'ts-fsrs'
import type {
  FsrsOptimizerConfiguration,
  LearningPhase,
  LearningState,
  PersistedLearningState,
  RatingEventForReplay,
  ReviewRating,
} from './types'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import {
  createEmptyCard,
  fsrs,
  FSRSVersion,
  generatorParameters,
  Rating,
  State,
} from 'ts-fsrs'

export function defaultOptimizerConfiguration(): FsrsOptimizerConfiguration {
  const parameters = generatorParameters({ enable_fuzz: true })
  return {
    desiredRetention: parameters.request_retention,
    enableFuzz: parameters.enable_fuzz,
    fsrsParameters: [...parameters.w],
    learningSteps: [...parameters.learning_steps],
    maximumIntervalDays: parameters.maximum_interval,
    relearningSteps: [...parameters.relearning_steps],
  }
}

function assertFiniteNumber(value: number, description: string): void {
  if (!Number.isFinite(value))
    throw new TypeError(`${description} must be finite`)
}

function validateSteps(steps: readonly string[], description: string): readonly StepUnit[] {
  if (!Array.isArray(steps))
    throw new TypeError(`${description} must be an array`)
  for (const step of steps) {
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?[mhd]$/u.test(step))
      throw new TypeError(`${description} contains invalid step ${step}`)
  }
  return steps as readonly StepUnit[]
}

export function validateOptimizerConfiguration(
  configuration: FsrsOptimizerConfiguration,
): FsrsOptimizerConfiguration {
  assertFiniteNumber(configuration.desiredRetention, 'Desired retention')
  if (configuration.desiredRetention <= 0 || configuration.desiredRetention > 1)
    throw new RangeError('Desired retention must be greater than 0 and no greater than 1')
  if (!Number.isInteger(configuration.maximumIntervalDays) || configuration.maximumIntervalDays < 1)
    throw new RangeError('Maximum interval must be a positive integer')
  if (typeof configuration.enableFuzz !== 'boolean')
    throw new TypeError('Enable fuzz must be a boolean')
  if (!Array.isArray(configuration.fsrsParameters) || configuration.fsrsParameters.length === 0)
    throw new TypeError('FSRS parameters must be a non-empty array')
  configuration.fsrsParameters.forEach((value, index) => assertFiniteNumber(value, `FSRS parameter ${index}`))

  const learningSteps = validateSteps(configuration.learningSteps, 'Learning steps')
  const relearningSteps = validateSteps(configuration.relearningSteps, 'Relearning steps')

  schedulerParameters({
    ...configuration,
    learningSteps,
    relearningSteps,
  })
  return {
    desiredRetention: configuration.desiredRetention,
    enableFuzz: configuration.enableFuzz,
    fsrsParameters: [...configuration.fsrsParameters],
    learningSteps: [...learningSteps],
    maximumIntervalDays: configuration.maximumIntervalDays,
    relearningSteps: [...relearningSteps],
  }
}

function schedulerParameters(configuration: FsrsOptimizerConfiguration): FSRSParameters {
  return generatorParameters({
    enable_fuzz: configuration.enableFuzz,
    enable_short_term: true,
    learning_steps: validateSteps(configuration.learningSteps, 'Learning steps'),
    maximum_interval: configuration.maximumIntervalDays,
    relearning_steps: validateSteps(configuration.relearningSteps, 'Relearning steps'),
    request_retention: configuration.desiredRetention,
    w: configuration.fsrsParameters,
  })
}

function toGrade(rating: ReviewRating): Grade {
  switch (rating) {
    case 'again':
      return Rating.Again
    case 'hard':
      return Rating.Hard
    case 'good':
      return Rating.Good
    case 'easy':
      return Rating.Easy
  }
}

function toLearningPhase(state: State): LearningPhase {
  switch (state) {
    case State.New:
      return 'new'
    case State.Learning:
      return 'learning'
    case State.Review:
      return 'review'
    case State.Relearning:
      return 'relearning'
  }
}

function stateHash(state: LearningState): string {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(state))))
}

function toLearningState(
  card: Card,
  targetId: string,
  optimizerRevisionId: string,
  winningEventId: string | null,
): PersistedLearningState {
  const state: LearningState = {
    difficulty: card.difficulty,
    dueAt: card.due.getTime(),
    lapses: card.lapses,
    lastReviewAt: card.last_review?.getTime() ?? null,
    learningSteps: card.learning_steps,
    optimizerRevisionId,
    phase: toLearningPhase(card.state),
    reps: card.reps,
    scheduledDays: card.scheduled_days,
    stability: card.stability,
    targetId,
    winningEventId,
  }
  return { ...state, stateHash: stateHash(state) }
}

export function emptyLearningState(
  targetId: string,
  createdAt: number,
  optimizerRevisionId: string,
): PersistedLearningState {
  return toLearningState(createEmptyCard(new Date(createdAt)), targetId, optimizerRevisionId, null)
}

export function replayRatings(
  targetId: string,
  createdAt: number,
  optimizerRevisionId: string,
  configuration: FsrsOptimizerConfiguration,
  ratings: readonly RatingEventForReplay[],
): PersistedLearningState {
  const scheduler = fsrs(schedulerParameters(configuration))
  let card = createEmptyCard(new Date(createdAt))
  let winningEventId: string | null = null
  for (const event of ratings) {
    scheduler.seed = `${targetId}:${event.eventId}`
    card = scheduler.next(card, new Date(event.occurredAt), toGrade(event.rating)).card
    winningEventId = event.eventId
  }
  return toLearningState(card, targetId, optimizerRevisionId, winningEventId)
}

export { FSRSVersion }
