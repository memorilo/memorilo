export type LearningPhase = 'learning' | 'new' | 'relearning' | 'review'
export type LearningDailyGoalMode = 'all-due' | 'fixed' | 'spread-week'
export type LearningQueueKind = 'interday-learning' | 'intraday-learning' | 'new' | 'review'
export type LearningQueueMode = 'mixed' | 'new' | 'review'
export type ReviewRating = 'again' | 'easy' | 'good' | 'hard'

export interface FsrsOptimizerConfiguration {
  desiredRetention: number
  enableFuzz: boolean
  fsrsParameters: readonly number[]
  learningSteps: readonly string[]
  maximumIntervalDays: number
  relearningSteps: readonly string[]
}

export interface LearningState {
  difficulty: number
  dueAt: number
  lapses: number
  lastReviewAt: number | null
  learningSteps: number
  optimizerRevisionId: string
  phase: LearningPhase
  reps: number
  scheduledDays: number
  stability: number
  targetId: string
  winningEventId: string | null
}

export interface LearningQueuePolicy {
  buryInterdayLearningSiblings: boolean
  buryNewSiblings: boolean
  buryReviewSiblings: boolean
  interdayOrder: 'after-reviews' | 'before-reviews' | 'mixed'
  learnAheadMinutes: number
  maxNewCardsPerDay: number
  newGatherOrder: 'random' | 'source'
  reviewOrder: 'due-random' | 'retrievability'
  studyDayStartsAtHour: number
}

export interface LearningPracticeConfiguration {
  dailyGoal: {
    fixedCards: number
    mode: LearningDailyGoalMode
  }
  queuePolicy: LearningQueuePolicy
}

export interface PersistedLearningState extends LearningState {
  stateHash: string
}

export interface RatingEventForReplay {
  eventId: string
  occurredAt: number
  rating: ReviewRating
}

export interface RatingHistory {
  ratings: readonly RatingEventForReplay[]
  targetId: string
}

export interface QueueState {
  phase: LearningPhase
  scheduledDays: number
}

export interface LearningQueueCandidate<Value> extends QueueState {
  cardId: string
  dueAt: number
  lastReviewAt: number | null
  noteId: string
  optimizerConfiguration: FsrsOptimizerConfiguration
  sourceBlockId: string
  sourceOrder: number
  stability: number
  topicOrder: number
  value: Value
}

export interface SiblingBuryEvent {
  noteId: string
  sourceBlockId: string
  sourceCardId: string
  sourceQueue: LearningQueueKind
}

export interface SelectLearningQueueInput<Value> {
  candidates: readonly LearningQueueCandidate<Value>[]
  introducedCardIds: ReadonlySet<string>
  limit: number
  mode: LearningQueueMode
  now: number
  policy: LearningQueuePolicy
  remainingNewCards: number
  siblingBuryEvents: readonly SiblingBuryEvent[]
}

export interface StudyDayBounds {
  endsAt: number
  startedAt: number
}
