import type { CardSurfaceItemSelection } from '@memorilo/editor'
import type { TFunction } from 'i18next'
import type { ReviewRating } from './learning-review-rating-model'
import type { LearningReviewRoute } from './learning-review-route'
import type { LearningReviewFailure, LearningReviewWorkflow } from './learning-review-workflow'
import type { ReviewCardRating } from './review-card-session'
import * as stylex from '@stylexjs/stylex'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  Check,
  ChevronRight,
  LoaderCircle,
  RotateCcw,
} from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { lazy, Suspense, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { useOwnedResource } from '../../../shared/lifecycle/owned-resource'
import { usePageTitlebar } from '../../../shared/page-titlebar'
import { learningQueryKeys } from '../query-keys'
import { learningReviewPageStyles as styles } from './learning-review-page.stylex'
import { learningReviewRoute } from './learning-review-route'
import { LearningReviewTitlebar } from './learning-review-titlebar'
import { createLearningReviewWorkflow } from './learning-review-workflow'
import { ReviewCardSession } from './review-card-session'

const ReviewMaterial = lazy(async () => {
  const module = await import('./learning-review-source')
  return { default: module.LearningReviewSource }
})

const ratings: readonly ReviewRating[] = ['again', 'hard', 'good', 'easy']

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function reviewFailureMessage(failure: LearningReviewFailure, t: TFunction): string {
  const message = errorMessage(failure.cause)
  if (failure.operation === 'prepare')
    return t('prepareReviewFailed', { message })
  if (failure.operation === 'rate')
    return t('rateReviewFailed', { message })
  return t('undoReviewFailed', { message })
}

function formatInterval(milliseconds: number, t: TFunction): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0)
    throw new RangeError(`Review interval must be a non-negative finite number, received ${milliseconds}`)
  if (milliseconds < 60_000)
    return t('intervalLessThanMinute')
  const minutes = Math.max(1, Math.round(milliseconds / 60_000))
  if (minutes < 60)
    return t('intervalMinutes', { count: minutes })
  const hours = Math.max(1, Math.round(milliseconds / 3_600_000))
  if (hours < 24)
    return t('intervalHours', { count: hours })
  const days = Math.max(1, Math.round(milliseconds / 86_400_000))
  if (days < 30)
    return t('intervalDays', { count: days })
  const months = Math.max(1, Math.round(days / 30))
  if (days < 365)
    return t('intervalMonths', { count: months })
  return t('intervalYears', { count: Math.max(1, Math.round(days / 365)) })
}

function intervalLabel(
  { maximum, minimum }: { maximum: number, minimum: number },
  t: TFunction,
): string {
  const first = formatInterval(minimum, t)
  return minimum === maximum ? first : `${first} - ${formatInterval(maximum, t)}`
}

function ignoresReviewShortcut(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest('button, a, input, select, textarea, [contenteditable="true"]') !== null
}

export function LearningReviewPage({
  replaceRoute,
  route,
}: {
  replaceRoute: (route: LearningReviewRoute) => void
  route: LearningReviewRoute
}) {
  const queryClient = useQueryClient()
  const replaceRouteRef = useRef(replaceRoute)
  replaceRouteRef.current = replaceRoute
  const initialRoute = useRef(route).current
  const configuration = useMemo(() => ({ initialRoute, queryClient }), [initialRoute, queryClient])
  const workflow = useOwnedResource(
    'Learning review workflow',
    configuration,
    current => createLearningReviewWorkflow({
      initialRoute: current.initialRoute,
      invalidateProgress: () => {
        void current.queryClient.invalidateQueries({ queryKey: learningQueryKeys.activitySummary })
        void current.queryClient.invalidateQueries({ queryKey: learningQueryKeys.dailyProgress })
      },
      learning: window.desktop.learning,
      replaceRoute: next => replaceRouteRef.current(next),
    }),
  )
  if (!workflow)
    return null
  return <LearningReviewPageSession route={route} workflow={workflow} />
}

function LearningReviewPageSession({
  route,
  workflow,
}: {
  route: LearningReviewRoute
  workflow: LearningReviewWorkflow
}) {
  const { t } = useTranslation('learning')
  const shouldReduceMotion = useReducedMotion()
  const {
    actionError,
    actionPending,
    historyLength,
    preparationError,
    projection,
    ratingIntervals,
    scope,
    view,
  } = useSyncExternalStore(workflow.subscribe, workflow.snapshot, workflow.snapshot)
  const routeIdentity = learningReviewRoute.identity(route)
  const routeRef = useRef(route)
  routeRef.current = route
  const progressQuery = useQuery({
    queryFn: () => window.desktop.learning.getDailyProgress(),
    queryKey: learningQueryKeys.dailyProgress,
    refetchOnMount: 'always',
  })

  useEffect(() => {
    workflow.setRoute(routeRef.current)
  }, [workflow, routeIdentity])

  const titlebarLeading = useMemo(() => (
    <LearningReviewTitlebar
      actionPending={actionPending}
      active={view.status === 'active' ? view : null}
      activeProjection={projection}
      dailyProgress={progressQuery.data}
      historyLength={historyLength}
      scope={scope}
      shouldReduceMotion={shouldReduceMotion}
      t={t}
      onToggleSource={workflow.toggleSource}
      onUndo={workflow.undo}
    />
  ), [
    actionPending,
    workflow,
    historyLength,
    progressQuery.data,
    projection,
    scope,
    shouldReduceMotion,
    t,
    view,
  ])
  const titlebar = useMemo(() => ({ leading: titlebarLeading }), [titlebarLeading])
  usePageTitlebar(titlebar)

  useEffect(() => {
    if (view.status !== 'active' || actionPending)
      return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || ignoresReviewShortcut(event.target))
        return
      if (!view.revealed && event.code === 'Space') {
        event.preventDefault()
        workflow.reveal()
        return
      }
      const rating = event.key === '1'
        ? 'again'
        : event.key === '2' ? 'hard' : event.key === '3' ? 'good' : event.key === '4' ? 'easy' : null
      if (view.revealed && rating) {
        event.preventDefault()
        void workflow.rate(rating)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [actionPending, workflow, view])

  if (view.status === 'loading') {
    return (
      <main
        {...stylex.props(styles.page, styles.centeredStatus)}
        aria-label={t('reviewTitle')}
        role="status"
      >
        <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={18} />
        <span>{t('loadingReview')}</span>
      </main>
    )
  }

  if (view.status === 'error') {
    return (
      <main
        {...stylex.props(styles.page, styles.centeredStatus, styles.errorStatus)}
        aria-label={t('reviewTitle')}
        role="alert"
      >
        <p {...stylex.props(styles.statusTitle)}>{t('reviewUnavailable')}</p>
        <p {...stylex.props(styles.statusMessage)}>{errorMessage(view.cause)}</p>
        <div {...stylex.props(styles.statusActions)}>
          <Link {...stylex.props(styles.secondaryButton)} search={{}} to="/learning">{t('backToLearning')}</Link>
          <button
            {...stylex.props(styles.primaryButton)}
            type="button"
            onClick={workflow.retry}
          >
            {t('retry')}
          </button>
        </div>
      </main>
    )
  }

  if (view.status === 'complete') {
    return (
      <main
        {...stylex.props(styles.page, styles.completion)}
        aria-label={t('reviewTitle')}
      >
        <span {...stylex.props(styles.completionIcon)}><Check aria-hidden="true" size={28} strokeWidth={1.8} /></span>
        <h1 {...stylex.props(styles.completionTitle)}>{t('reviewComplete')}</h1>
        <p {...stylex.props(styles.completionMessage)}>{t(scope === 'note' ? 'noteReviewCompleteDescription' : 'globalReviewCompleteDescription')}</p>
        <div {...stylex.props(styles.statusActions)}>
          {historyLength > 0
            ? (
                <button
                  {...stylex.props(styles.secondaryButton)}
                  disabled={actionPending}
                  type="button"
                  onClick={() => void workflow.undo()}
                >
                  <RotateCcw aria-hidden="true" size={14} strokeWidth={1.8} />
                  {t('undoRating')}
                </button>
              )
            : null}
          <Link {...stylex.props(styles.primaryButton)} search={{}} to="/learning">
            {t('backToLearning')}
            <ChevronRight aria-hidden="true" size={15} strokeWidth={1.9} />
          </Link>
        </div>
      </main>
    )
  }

  const active = view
  if (!projection)
    throw new Error('Active Learning Review is missing its projection')
  const activeProjection = projection
  const showSource = active.item.card.kind !== 'image-occlusion' && active.sourceVisible
  const inlineError = actionError ?? preparationError
  const itemSelection: CardSurfaceItemSelection | undefined = activeProjection.supportsForgottenSelection
    ? {
        label: (_itemBlockId, selected) => t(selected ? 'markItemRemembered' : 'markItemForgotten'),
        onToggle: workflow.toggleForgotten,
        selectedItemBlockIds: [...active.forgottenItemBlockIds],
      }
    : undefined
  const materialKey = `${active.item.queue.cardId}:${active.targetId}`
  const reviewRatings: readonly ReviewCardRating<ReviewRating>[] = ratings.map(rating => ({
    id: rating,
    interval: ratingIntervals ? intervalLabel(ratingIntervals[rating], t) : '...',
    label: t(`rating.${rating}`),
    tone: rating,
  }))

  return (
    <ReviewCardSession
      actionError={inlineError ? reviewFailureMessage(inlineError, t) : null}
      actionPending={actionPending}
      ariaLabel={t('reviewTitle')}
      dataAttributes={{
        'data-active-review-card-id': active.item.queue.cardId,
        'data-active-review-target-id': active.targetId,
      }}
      materialAriaLabel={showSource ? t('cardSource') : t('currentCard')}
      materialDataAttributes={{ 'data-review-target-id': active.targetId }}
      materialKey={materialKey}
      pendingLabel={t('savingRating')}
      rateAriaLabel={t('rateCard')}
      ratingsDisabled={ratingIntervals === null}
      ratings={reviewRatings}
      revealed={active.revealed}
      shouldReduceMotion={shouldReduceMotion}
      showAnswerLabel={t('showAnswer')}
      onRate={rating => void workflow.rate(rating)}
      onReveal={workflow.reveal}
    >
      <Suspense fallback={<div {...stylex.props(styles.materialLoading)} role="status">{t('loadingSource')}</div>}>
        <ReviewMaterial
          item={active.item}
          itemSelection={itemSelection}
          revealedItemBlockIds={activeProjection.visibleItemBlockIds}
          showSource={showSource}
          side={active.revealed ? 'answer' : 'question'}
        />
      </Suspense>
    </ReviewCardSession>
  )
}
