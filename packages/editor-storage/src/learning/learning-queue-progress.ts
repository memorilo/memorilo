import type { EditorStorageDatabase } from '../database-driver'
import type {
  LearningDailyProgress,
  LearningPracticeConfiguration,
  ReviewRating,
} from './types'
import { addStudyDays, studyDayBounds, validateLearningPracticeConfiguration } from '@memorilo/srs'

interface DailyRatingRow {
  card_id: string
  rating: ReviewRating
}

interface CardIdRow {
  card_id: string
}

export interface FirstReviewRow {
  card_id: string
  first_reviewed_at: number
}

export function readFirstReviewTimes(
  database: EditorStorageDatabase,
): Promise<readonly FirstReviewRow[]> {
  return database.all<FirstReviewRow>(
    'SELECT card_id, introduced_at AS first_reviewed_at FROM learning_card_introductions',
  )
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

  constructor(dependencies: LearningQueueProgressDependencies) {
    this.#configuration = dependencies.configuration
    this.#database = dependencies.database
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
      this.#database.all<DailyRatingRow>(
        'SELECT e.card_id, e.rating FROM learning_review_events e JOIN learning_targets t ON t.target_id = e.target_id WHERE t.target_kind = \'whole\' AND e.event_kind = \'rating\' AND e.occurred_at >= ? AND e.occurred_at <= ? AND NOT EXISTS (SELECT 1 FROM learning_review_events u WHERE u.event_kind = \'undo\' AND u.undoes_event_id = e.event_id)',
        [studyDayStartedAt, now],
      ),
      this.#database.all<CardIdRow>(
        'SELECT DISTINCT c.card_id FROM learning_cards c JOIN learning_targets t ON t.card_id = c.card_id JOIN learning_states s ON s.target_id = t.target_id WHERE c.active = 1 AND t.active = 1 AND s.phase <> \'new\' AND s.due_at < ?',
        [studyDayEndsAt],
      ),
      this.#database.all<CardIdRow>(
        'SELECT DISTINCT c.card_id FROM learning_cards c JOIN learning_targets t ON t.card_id = c.card_id JOIN learning_states s ON s.target_id = t.target_id WHERE c.active = 1 AND t.active = 1 AND s.phase <> \'new\' AND s.due_at < ?',
        [studyWeekEndsAt],
      ),
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
}
