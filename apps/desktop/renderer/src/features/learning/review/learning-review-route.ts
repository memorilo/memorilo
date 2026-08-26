import type {
  DesktopReviewItem,
  RestoreDesktopReviewItemInput,
} from '@memorilo/desktop-api'
import type { ReadingItem } from '@memorilo/editor-storage'
import type { ReviewRating } from './learning-review-rating-model'

export type LearningReviewScope = 'global' | 'note'
export type LearningReviewPresentation = 'full' | 'partial'

export interface LearningReviewRoute {
  cardId?: string
  listRatings?: string
  noteId?: string
  presentation?: LearningReviewPresentation
  readingItemId?: string
  scope: LearningReviewScope
  scopeNoteId?: string
  targetId?: string
  topicId?: string
}

function nonEmptyString(value: unknown, description: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new TypeError(`${description} must be a non-empty string`)
  return value
}

function parseRatings(value: string | undefined): readonly ReviewRating[] {
  if (value === undefined)
    return []
  return value.split(',').map((rating) => {
    if (rating !== 'again' && rating !== 'hard' && rating !== 'good' && rating !== 'easy')
      throw new TypeError(`Unsupported saved List Rating: ${rating}`)
    return rating
  })
}

function validate(route: Partial<Record<keyof LearningReviewRoute, unknown>>): LearningReviewRoute {
  const scope = route.scope === undefined ? 'global' : route.scope
  if (scope !== 'global' && scope !== 'note')
    throw new TypeError('Review scope must be global or note')

  const scopeNoteId = route.scopeNoteId === undefined
    ? undefined
    : nonEmptyString(route.scopeNoteId, 'Review scope Note id')
  if (scope === 'note' && scopeNoteId === undefined)
    throw new TypeError('A Note review scope requires scopeNoteId')
  if (scope === 'global' && scopeNoteId !== undefined)
    throw new TypeError('A Global review scope cannot include scopeNoteId')

  const identityValues = [route.cardId, route.noteId, route.presentation, route.targetId, route.topicId]
  if (route.readingItemId !== undefined) {
    if (route.cardId !== undefined || route.presentation !== undefined || route.targetId !== undefined || route.listRatings !== undefined)
      throw new TypeError('A saved Reading Item position cannot contain Card identity')
    const noteId = nonEmptyString(route.noteId, 'Reading Item Note id')
    if (scopeNoteId !== undefined && noteId !== scopeNoteId)
      throw new TypeError('The saved Reading Item is outside the selected Note scope')
    return {
      noteId,
      readingItemId: nonEmptyString(route.readingItemId, 'Reading Item id'),
      scope,
      ...(scopeNoteId === undefined ? {} : { scopeNoteId }),
      topicId: nonEmptyString(route.topicId, 'Reading Item Topic id'),
    }
  }
  const identityProvided = identityValues.filter(value => value !== undefined).length
  if (identityProvided !== 0 && identityProvided !== identityValues.length)
    throw new TypeError('A saved Review position requires complete Card identity')
  if (identityProvided === 0) {
    if (route.listRatings !== undefined)
      throw new TypeError('Saved List Ratings require a complete Card identity')
    return scopeNoteId === undefined ? { scope } : { scope, scopeNoteId }
  }

  const presentation = route.presentation
  if (presentation !== 'full' && presentation !== 'partial')
    throw new TypeError('Review presentation must be full or partial')
  const listRatings = route.listRatings === undefined
    ? undefined
    : nonEmptyString(route.listRatings, 'Saved List Ratings')
  if (listRatings !== undefined) {
    if (presentation !== 'full')
      throw new TypeError('Partial Cards cannot contain saved List Ratings')
    parseRatings(listRatings)
  }
  const noteId = nonEmptyString(route.noteId, 'Review Card Note id')
  if (scopeNoteId !== undefined && noteId !== scopeNoteId)
    throw new TypeError('The saved Review Card is outside the selected Note scope')

  return {
    cardId: nonEmptyString(route.cardId, 'Review Card id'),
    ...(listRatings === undefined ? {} : { listRatings }),
    noteId,
    presentation,
    scope,
    ...(scopeNoteId === undefined ? {} : { scopeNoteId }),
    targetId: nonEmptyString(route.targetId, 'Review Target id'),
    topicId: nonEmptyString(route.topicId, 'Review Card Topic id'),
  }
}

function base(route: LearningReviewRoute): LearningReviewRoute {
  return route.scope === 'note'
    ? { scope: 'note', scopeNoteId: route.scopeNoteId }
    : { scope: 'global' }
}

function identity(route: LearningReviewRoute): string {
  return JSON.stringify([
    route.scope,
    route.scopeNoteId,
    route.noteId,
    route.readingItemId,
    route.topicId,
    route.cardId,
    route.listRatings,
    route.presentation,
    route.targetId,
  ])
}

function readingPosition(scope: LearningReviewRoute, item: ReadingItem): LearningReviewRoute {
  return {
    ...base(scope),
    noteId: item.noteId,
    readingItemId: item.readingItemId,
    topicId: item.topicId,
  }
}

function position(
  scope: LearningReviewRoute,
  item: DesktopReviewItem,
  targetId: string,
  listRatings: readonly ReviewRating[],
): LearningReviewRoute {
  return {
    ...base(scope),
    cardId: item.queue.cardId,
    ...(listRatings.length === 0 ? {} : { listRatings: listRatings.join(',') }),
    noteId: item.queue.noteId,
    presentation: item.queue.presentation,
    targetId,
    topicId: item.queue.topicId,
  }
}

function restore(route: LearningReviewRoute): RestoreDesktopReviewItemInput | null {
  if (!route.cardId)
    return null
  if (!route.noteId || !route.presentation || !route.targetId || !route.topicId)
    throw new Error('Validated Review route is missing its Card identity')
  return {
    cardId: route.cardId,
    noteId: route.noteId,
    presentation: route.presentation,
    targetId: route.targetId,
    topicId: route.topicId,
  }
}

export const learningReviewRoute = {
  base,
  identity,
  position,
  readingPosition,
  restoreReading: (route: LearningReviewRoute) => route.readingItemId ?? null,
  restore,
  savedRatings: (route: LearningReviewRoute) => parseRatings(route.listRatings),
  validate,
}
