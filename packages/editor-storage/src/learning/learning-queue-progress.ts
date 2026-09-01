import type { EditorStorageDatabase, EditorStorageDrizzleDatabase } from '../database-driver'
import type {
  GetLearningActivitySummaryInput,
  LearningActivitySummary,
  LearningDailyProgress,
  LearningPracticeConfiguration,
  ReviewRating,
} from './types'
import { addStudyDays, studyDayBounds, validateLearningPracticeConfiguration } from '@memorilo/srs'
import { and, asc, eq, gte, lt, lte, ne, notExists } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { learningCardIntroductions, learningCards, learningReviewEvents, learningStates, learningTargets } from '../drizzle-schema'

const undoneReviewEvents = alias(learningReviewEvents, 'undone_review_events')

interface DailyRatingRow {
  card_id: string
  rating: ReviewRating
}

interface ActivityRatingRow extends DailyRatingRow {
  occurred_at: number
}

interface CardIdRow {
  card_id: string
}

export interface FirstReviewRow {
  card_id: string
  first_reviewed_at: number
}

export async function readFirstReviewTimes(
  database: EditorStorageDatabase,
): Promise<readonly FirstReviewRow[]> {
  return database.drizzle.select({ card_id: learningCardIntroductions.cardId, first_reviewed_at: learningCardIntroductions.introducedAt }).from(learningCardIntroductions).orderBy(asc(learningCardIntroductions.cardId)).all() as FirstReviewRow[]
}

interface LearningQueueProgressDependencies {
  configuration: () => LearningPracticeConfiguration
  database: EditorStorageDatabase
}

/**
 * Computes progress from immutable review facts. The queue facade owns the
 * operation admission; this private module only owns the aggregation rules.
 */
export class LearningQueueProgressReader {
  readonly #configuration: LearningQueueProgressDependencies['configuration']
  readonly #database: EditorStorageDatabase
  readonly #orm: EditorStorageDrizzleDatabase

  constructor(dependencies: LearningQueueProgressDependencies) {
    this.#configuration = dependencies.configuration
    this.#database = dependencies.database
    this.#orm = dependencies.database.drizzle
  }

  async getActivitySummary(
    input: GetLearningActivitySummaryInput = {},
  ): Promise<LearningActivitySummary> {
    const now = input.now ?? Date.now()
    if (!Number.isSafeInteger(now) || now < 0)
      throw new RangeError('Learning activity time must be a non-negative safe integer timestamp')
    const days = input.days ?? 140
    if (!Number.isSafeInteger(days) || days < 28 || days > 366)
      throw new RangeError('Learning activity days must be a safe integer between 28 and 366')

    const { queuePolicy } = validateLearningPracticeConfiguration(this.#configuration())
    const currentStudyDay = studyDayBounds(now, queuePolicy.studyDayStartsAtHour).startedAt
    const firstStudyDay = addStudyDays(currentStudyDay, -(days - 1))
    const [dailyProgress, ratings] = await Promise.all([
      this.getDailyProgress(now),
      this.#ratings(firstStudyDay, now),
    ])

    const mutableDays = Array.from({ length: days }, (_, index) => ({
      reviewCount: 0,
      reviewedCardIds: new Set<string>(),
      studyDayStartedAt: addStudyDays(firstStudyDay, index),
      successfulReviewCount: 0,
    }))
    const dayByStart = new Map(mutableDays.map(day => [day.studyDayStartedAt, day]))
    for (const rating of ratings) {
      const studyDayStartedAt = studyDayBounds(
        rating.occurred_at,
        queuePolicy.studyDayStartsAtHour,
      ).startedAt
      const day = dayByStart.get(studyDayStartedAt)
      if (!day)
        throw new Error(`Review at ${rating.occurred_at} falls outside the requested activity period`)
      day.reviewCount += 1
      day.reviewedCardIds.add(rating.card_id)
      if (rating.rating !== 'again')
        day.successfulReviewCount += 1
    }

    const activityDays = mutableDays.map(day => ({
      reviewCount: day.reviewCount,
      reviewedCards: day.reviewedCardIds.size,
      studyDayStartedAt: day.studyDayStartedAt,
      successfulReviewCount: day.successfulReviewCount,
    }))
    let streakIndex = activityDays.length - 1
    if (activityDays[streakIndex]?.reviewedCards === 0)
      streakIndex -= 1
    let currentStreakDays = 0
    while (streakIndex >= 0 && activityDays[streakIndex]?.reviewedCards !== 0) {
      currentStreakDays += 1
      streakIndex -= 1
    }

    return {
      currentStreakDays,
      dailyProgress,
      days: activityDays,
    }
  }

  async getDailyProgress(now = Date.now()): Promise<LearningDailyProgress> {
    if (!Number.isSafeInteger(now) || now < 0)
      throw new RangeError('Daily learning progress time must be a non-negative safe integer timestamp')
    const { dailyGoal, queuePolicy } = validateLearningPracticeConfiguration(this.#configuration())
    const {
      endsAt: studyDayEndsAt,
      startedAt: studyDayStartedAt,
    } = studyDayBounds(now, queuePolicy.studyDayStartsAtHour)
    const studyWeekEndsAt = addStudyDays(studyDayStartedAt, 7)
    const [ratings, dueTodayRows, dueWeekRows, firstReviews] = await Promise.all([
      this.#ratings(studyDayStartedAt, now),
      this.#dueCards(studyDayEndsAt),
      this.#dueCards(studyWeekEndsAt),
      readFirstReviewTimes(this.#database),
    ])

    const completedCards = new Set<string>()
    const forgottenCards = new Set<string>()
    for (const rating of ratings) {
      if (rating.rating === 'again')
        forgottenCards.add(rating.card_id)
      else
        completedCards.add(rating.card_id)
    }
    for (const cardId of completedCards)
      forgottenCards.delete(cardId)

    const remainingDueCards = new Set(dueTodayRows.map(row => row.card_id))
    for (const cardId of forgottenCards)
      remainingDueCards.add(cardId)
    for (const cardId of completedCards)
      remainingDueCards.delete(cardId)

    const availableToday = completedCards.size + remainingDueCards.size
    let dailyGoalCards: number
    switch (dailyGoal.mode) {
      case 'all-due':
        dailyGoalCards = availableToday
        break
      case 'fixed':
        dailyGoalCards = Math.min(dailyGoal.fixedCards, availableToday)
        break
      case 'spread-week': {
        const weeklyCards = new Set(dueWeekRows.map(row => row.card_id))
        for (const cardId of forgottenCards)
          weeklyCards.add(cardId)
        for (const cardId of completedCards)
          weeklyCards.add(cardId)
        dailyGoalCards = Math.max(completedCards.size, Math.ceil(weeklyCards.size / 7))
        break
      }
    }

    const introducedNewCards = firstReviews.filter(review => (
      review.first_reviewed_at >= studyDayStartedAt && review.first_reviewed_at <= now
    )).length
    return {
      completedCards: completedCards.size,
      dailyGoalCards,
      dailyGoalMode: dailyGoal.mode,
      dueReviewCards: remainingDueCards.size,
      introducedNewCards,
      newCardsPerDay: queuePolicy.maxNewCardsPerDay,
      remainingNewCards: Math.max(0, queuePolicy.maxNewCardsPerDay - introducedNewCards),
      studyDayEndsAt,
      studyDayStartedAt,
    }
  }

  async #ratings(from: number, through: number): Promise<readonly ActivityRatingRow[]> {
    return this.#orm.select({
      card_id: learningReviewEvents.cardId,
      rating: learningReviewEvents.rating,
      occurred_at: learningReviewEvents.occurredAt,
    }).from(learningReviewEvents).innerJoin(learningTargets, eq(learningTargets.targetId, learningReviewEvents.targetId)).where(and(
      eq(learningTargets.targetKind, 'whole'),
      eq(learningReviewEvents.eventKind, 'rating'),
      gte(learningReviewEvents.occurredAt, from),
      lte(learningReviewEvents.occurredAt, through),
      notExists(this.#orm.select({ eventId: undoneReviewEvents.eventId })
        .from(undoneReviewEvents)
        .where(and(
          eq(undoneReviewEvents.eventKind, 'undo'),
          eq(undoneReviewEvents.undoesEventId, learningReviewEvents.eventId),
        ))),
    )).orderBy(asc(learningReviewEvents.occurredAt), asc(learningReviewEvents.eventId)).all() as ActivityRatingRow[]
  }

  async #dueCards(before: number): Promise<readonly CardIdRow[]> {
    return this.#orm.selectDistinct({ card_id: learningCards.cardId })
      .from(learningCards)
      .innerJoin(learningTargets, eq(learningTargets.cardId, learningCards.cardId))
      .innerJoin(learningStates, eq(learningStates.targetId, learningTargets.targetId))
      .where(and(eq(learningCards.active, 1), eq(learningTargets.active, 1), ne(learningStates.phase, 'new'), lt(learningStates.dueAt, before)))
      .orderBy(asc(learningCards.cardId))
      .all() as CardIdRow[]
  }
}
