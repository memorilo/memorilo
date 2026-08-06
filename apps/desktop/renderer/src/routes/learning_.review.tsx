import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { LearningReviewWorkspace } from './-learning-review'
import { learningReviewStyles as styles } from './-learning-review.stylex'

export type LearningReviewScope = 'global' | 'note'
export type LearningReviewPresentation = 'full' | 'partial'

export interface LearningReviewSearch {
  cardId?: string
  listRatings?: string
  noteId?: string
  presentation?: LearningReviewPresentation
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

function validateLearningReviewSearch(search: Record<string, unknown>): LearningReviewSearch {
  const scope = search.scope === undefined ? 'global' : search.scope
  if (scope !== 'global' && scope !== 'note')
    throw new TypeError('Review scope must be global or note')

  const scopeNoteId = search.scopeNoteId === undefined
    ? undefined
    : nonEmptyString(search.scopeNoteId, 'Review scope Note id')
  if (scope === 'note' && scopeNoteId === undefined)
    throw new TypeError('A Note review scope requires scopeNoteId')
  if (scope === 'global' && scopeNoteId !== undefined)
    throw new TypeError('A Global review scope cannot include scopeNoteId')

  const identityValues = [search.cardId, search.noteId, search.presentation, search.targetId, search.topicId]
  const identityProvided = identityValues.filter(value => value !== undefined).length
  if (identityProvided !== 0 && identityProvided !== identityValues.length)
    throw new TypeError('A saved Review position requires complete Card identity')
  if (identityProvided === 0) {
    if (search.listRatings !== undefined)
      throw new TypeError('Saved List Ratings require a complete Card identity')
    return scopeNoteId === undefined ? { scope } : { scope, scopeNoteId }
  }

  const presentation = search.presentation
  if (presentation !== 'full' && presentation !== 'partial')
    throw new TypeError('Review presentation must be full or partial')
  const listRatings = search.listRatings === undefined
    ? undefined
    : nonEmptyString(search.listRatings, 'Saved List Ratings')
  if (listRatings !== undefined) {
    if (presentation !== 'full')
      throw new TypeError('Partial Cards cannot contain saved List Ratings')
    const values = listRatings.split(',')
    if (values.some(value => !['again', 'hard', 'good', 'easy'].includes(value)))
      throw new TypeError('Saved List Ratings contain an unsupported Rating')
  }
  const noteId = nonEmptyString(search.noteId, 'Review Card Note id')
  if (scopeNoteId !== undefined && noteId !== scopeNoteId)
    throw new TypeError('The saved Review Card is outside the selected Note scope')

  return {
    cardId: nonEmptyString(search.cardId, 'Review Card id'),
    ...(listRatings === undefined ? {} : { listRatings }),
    noteId,
    presentation,
    scope,
    ...(scopeNoteId === undefined ? {} : { scopeNoteId }),
    targetId: nonEmptyString(search.targetId, 'Review Target id'),
    topicId: nonEmptyString(search.topicId, 'Review Card Topic id'),
  }
}

export const Route = createFileRoute('/learning_/review')({
  component: LearningReviewRoute,
  validateSearch: validateLearningReviewSearch,
})

function LearningReviewRoute() {
  const { t } = useTranslation('learning')
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <main {...stylex.props(styles.page)} aria-label={t('reviewTitle')}>
      <LearningReviewWorkspace
        search={search}
        replaceSearch={next => void navigate({ replace: true, search: next })}
      />
    </main>
  )
}
