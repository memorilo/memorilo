import type {
  LearningQueueCandidate,
  LearningQueueKind,
  LearningQueuePolicy,
  QueueState,
  SelectLearningQueueInput,
  StudyDayBounds,
} from './types'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { forgetting_curve } from 'ts-fsrs'

type QueueEligibility = 'due' | 'future-intraday' | 'learn-ahead'

export function queueKindForState(state: QueueState): LearningQueueKind {
  if (state.phase === 'new')
    return 'new'
  if (state.phase === 'review')
    return 'review'
  return state.scheduledDays === 0 ? 'intraday-learning' : 'interday-learning'
}

export function addStudyDays(studyDay: number, days: number): number {
  const boundary = new Date(studyDay)
  boundary.setDate(boundary.getDate() + days)
  return boundary.getTime()
}

export function studyDayBounds(now: number, startHour: number): StudyDayBounds {
  const current = new Date(now)
  const boundary = new Date(current)
  boundary.setHours(startHour, 0, 0, 0)
  if (current.getTime() < boundary.getTime())
    boundary.setDate(boundary.getDate() - 1)
  const startedAt = boundary.getTime()
  return {
    endsAt: addStudyDays(startedAt, 1),
    startedAt,
  }
}

const queueRanks: Readonly<Record<LearningQueueKind, number>> = {
  'interday-learning': 1,
  'intraday-learning': 0,
  'new': 3,
  'review': 2,
}

function queueRank(queue: LearningQueueKind): number {
  return queueRanks[queue]
}

type BuryPolicyKey = 'buryInterdayLearningSiblings' | 'buryNewSiblings' | 'buryReviewSiblings'

const buryPolicyByQueue: Readonly<Record<Exclude<LearningQueueKind, 'intraday-learning'>, BuryPolicyKey>> = {
  'interday-learning': 'buryInterdayLearningSiblings',
  'new': 'buryNewSiblings',
  'review': 'buryReviewSiblings',
}

function buryEnabled(queue: LearningQueueKind, policy: LearningQueuePolicy): boolean {
  return queue === 'intraday-learning' ? false : policy[buryPolicyByQueue[queue]]
}

function siblingKey(noteId: string, sourceBlockId: string): string {
  return JSON.stringify([noteId, sourceBlockId])
}

function deterministicOrderKey(studyDay: number, cardId: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${String(studyDay)}:${cardId}`)))
}

export function selectLearningQueue<Value>(
  input: SelectLearningQueueInput<Value>,
): readonly Value[] {
  const { endsAt: nextStudyDay, startedAt: studyDay } = studyDayBounds(
    input.now,
    input.policy.studyDayStartsAtHour,
  )
  const eligibility = (
    candidate: LearningQueueCandidate<Value>,
    queue: LearningQueueKind,
  ): QueueEligibility | null => {
    if (candidate.dueAt <= input.now)
      return 'due'
    if (queue !== 'intraday-learning' || candidate.dueAt >= nextStudyDay)
      return null
    if (candidate.dueAt <= input.now + input.policy.learnAheadMinutes * 60_000)
      return 'learn-ahead'
    return 'future-intraday'
  }
  const candidates = input.candidates.flatMap((candidate) => {
    const queue = queueKindForState(candidate)
    const candidateEligibility = eligibility(candidate, queue)
    return candidateEligibility === null
      ? []
      : [{ candidate, eligibility: candidateEligibility, queue }]
  })
  const compareWithinQueue = (
    left: typeof candidates[number],
    right: typeof candidates[number],
  ): number => {
    if (left.queue === 'new' && right.queue === 'new') {
      if (input.policy.newGatherOrder === 'source') {
        return left.candidate.topicOrder - right.candidate.topicOrder
          || left.candidate.sourceOrder - right.candidate.sourceOrder
          || left.candidate.cardId.localeCompare(right.candidate.cardId)
      }
      return deterministicOrderKey(studyDay, left.candidate.cardId)
        .localeCompare(deterministicOrderKey(studyDay, right.candidate.cardId))
    }
    if (left.queue === 'review'
      && right.queue === 'review'
      && input.policy.reviewOrder === 'retrievability') {
      if (left.candidate.lastReviewAt === null || right.candidate.lastReviewAt === null)
        throw new Error('Review queue item is missing its last Review time')
      const leftElapsedDays = Math.max(0, (input.now - left.candidate.lastReviewAt) / 86_400_000)
      const rightElapsedDays = Math.max(0, (input.now - right.candidate.lastReviewAt) / 86_400_000)
      const retrievabilityDifference = forgetting_curve(
        left.candidate.optimizerConfiguration.fsrsParameters,
        leftElapsedDays,
        left.candidate.stability,
      ) - forgetting_curve(
        right.candidate.optimizerConfiguration.fsrsParameters,
        rightElapsedDays,
        right.candidate.stability,
      )
      if (retrievabilityDifference !== 0)
        return retrievabilityDifference
    }
    return left.candidate.dueAt - right.candidate.dueAt
      || deterministicOrderKey(studyDay, left.candidate.cardId)
        .localeCompare(deterministicOrderKey(studyDay, right.candidate.cardId))
  }
  const buryEventsBySource = new Map<string, SelectLearningQueueInput<Value>['siblingBuryEvents']>()
  for (const event of input.siblingBuryEvents) {
    const sourceKey = siblingKey(event.noteId, event.sourceBlockId)
    const events = buryEventsBySource.get(sourceKey)
    buryEventsBySource.set(sourceKey, events ? [...events, event] : [event])
  }
  const isBuriedByRating = (entry: typeof candidates[number]): boolean => {
    if (!buryEnabled(entry.queue, input.policy))
      return false
    const events = buryEventsBySource.get(siblingKey(
      entry.candidate.noteId,
      entry.candidate.sourceBlockId,
    )) ?? []
    return events.some(event => (
      event.sourceCardId !== entry.candidate.cardId
      && queueRank(event.sourceQueue) <= queueRank(entry.queue)
    ))
  }
  const gatherOrdered = candidates
    .filter(entry => !isBuriedByRating(entry))
    .sort((left, right) => queueRank(left.queue) - queueRank(right.queue) || compareWithinQueue(left, right))
  const seenCardsBySource = new Map<string, Set<string>>()
  const gatheredCandidates: typeof candidates = []
  for (const entry of gatherOrdered) {
    const sourceKey = siblingKey(entry.candidate.noteId, entry.candidate.sourceBlockId)
    const seenCards = seenCardsBySource.get(sourceKey) ?? new Set<string>()
    const hasEarlierSibling = [...seenCards].some(cardId => cardId !== entry.candidate.cardId)
    seenCards.add(entry.candidate.cardId)
    seenCardsBySource.set(sourceKey, seenCards)
    if (!hasEarlierSibling || !buryEnabled(entry.queue, input.policy))
      gatheredCandidates.push(entry)
  }
  const admittedNewCardIds = new Set<string>()
  const admittedCandidates = gatheredCandidates.filter((entry) => {
    if (entry.queue !== 'new' || input.introducedCardIds.has(entry.candidate.cardId))
      return true
    if (admittedNewCardIds.has(entry.candidate.cardId))
      return true
    if (admittedNewCardIds.size >= input.remainingNewCards)
      return false
    admittedNewCardIds.add(entry.candidate.cardId)
    return true
  })
  const candidatesForMode = admittedCandidates.filter(entry => (
    entry.queue === 'new' ? input.mode !== 'review' : input.mode !== 'new'
  ))
  const eligibleCandidates = candidatesForMode.filter(entry => entry.eligibility !== 'future-intraday')
  const dueCandidates = eligibleCandidates.filter(entry => entry.eligibility === 'due')
  const presentationRank = (entry: typeof candidates[number]): number => {
    if (entry.queue === 'intraday-learning')
      return 0
    if (entry.queue === 'new')
      return 40
    if (entry.queue === 'review')
      return 20
    return input.policy.interdayOrder === 'before-reviews'
      ? 10
      : input.policy.interdayOrder === 'after-reviews' ? 30 : 20
  }
  return (dueCandidates.length > 0 ? dueCandidates : eligibleCandidates)
    .sort((left, right) => presentationRank(left) - presentationRank(right) || compareWithinQueue(left, right))
    .map(entry => entry.candidate.value)
    .slice(0, input.limit)
}
