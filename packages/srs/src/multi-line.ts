import type { ReviewRating } from './types'

export interface MultiLineItemSchedule {
  dueAt: number
  ratings: readonly ReviewRating[]
  targetId: string
}

export interface SelectMultiLinePresentationInput {
  items: readonly MultiLineItemSchedule[]
  mainDueAt: number
  now: number
}

export interface MultiLinePresentation {
  presentation: 'full' | 'partial'
  targetIds: readonly string[]
}

function ratingRank(rating: ReviewRating): number {
  switch (rating) {
    case 'again':
      return 1
    case 'hard':
      return 2
    case 'good':
      return 3
    case 'easy':
      return 4
    default:
      throw new TypeError(`Unsupported multi-line Rating: ${String(rating)}`)
  }
}

function strugglingScore(ratings: readonly ReviewRating[]): number | null {
  const recent = ratings.slice(-2)
  if (recent.length === 0)
    return null
  let minimum = Number.POSITIVE_INFINITY
  let struggling = false
  for (const rating of recent) {
    const rank = ratingRank(rating)
    minimum = Math.min(minimum, rank)
    if (rating === 'again' || rating === 'hard')
      struggling = true
  }
  return struggling ? minimum : null
}

export function aggregateMultiLineRating(ratings: readonly ReviewRating[]): ReviewRating {
  if (ratings.length === 0)
    throw new TypeError('A multi-line Card requires at least one item Rating')
  const counts: Record<ReviewRating, number> = {
    again: 0,
    easy: 0,
    good: 0,
    hard: 0,
  }
  for (const rating of ratings) {
    ratingRank(rating)
    counts[rating] += 1
  }
  const successful = counts.good + counts.easy
  const unsuccessful = counts.again + counts.hard
  const total = successful + unsuccessful
  const unsuccessfulResult = total === 1
    ? unsuccessful > 0
    : total <= 4 ? unsuccessful >= total - 1 : unsuccessful / total >= 0.6
  if (unsuccessfulResult)
    return counts.again > counts.hard ? 'again' : 'hard'
  return counts.easy / total > 0.5 ? 'easy' : 'good'
}

export function isStrugglingMultiLineItem(ratings: readonly ReviewRating[]): boolean {
  return strugglingScore(ratings) !== null
}

export function selectMultiLinePresentation(
  input: SelectMultiLinePresentationInput,
): MultiLinePresentation {
  if (input.items.length === 0)
    throw new TypeError('A multi-line Card requires at least one item Target')
  const seen = new Set<string>()
  for (const item of input.items) {
    if (seen.has(item.targetId))
      throw new Error(`A multi-line Card contains duplicate item Target ${item.targetId}`)
    seen.add(item.targetId)
  }
  const allTargetIds = input.items.map(item => item.targetId)
  if (input.mainDueAt <= input.now)
    return { presentation: 'full', targetIds: allTargetIds }

  const scored = input.items.map(item => ({ item, score: strugglingScore(item.ratings) }))
  const struggling = scored.filter(
    (entry): entry is { item: MultiLineItemSchedule, score: number } => entry.score !== null,
  )
  if (struggling.length === 0)
    return { presentation: 'full', targetIds: allTargetIds }
  const worstScore = Math.min(...struggling.map(entry => entry.score))
  const partialTargetIds = scored
    .filter(entry => entry.score === worstScore
      || (entry.score !== null && entry.item.dueAt <= input.now))
    .map(entry => entry.item.targetId)
  return partialTargetIds.length === allTargetIds.length
    ? { presentation: 'full', targetIds: allTargetIds }
    : { presentation: 'partial', targetIds: partialTargetIds }
}
