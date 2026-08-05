import type {
  DesktopLearningApi,
  DesktopReviewItem,
  RestoreDesktopReviewItemInput,
} from '@memorilo/desktop-preload'
import type { CardPreviewItemSelection } from '@memorilo/editor'
import type { TFunction } from 'i18next'
import type { LearningReviewSearch } from './learning_.review'
import { CardPreview } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  Check,
  ChevronRight,
  LoaderCircle,
  RotateCcw,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { learningQueryKeys } from '../queries/learning-query-keys'
import { learningReviewStyles as styles } from './-learning-review.stylex'

const ReviewSource = lazy(async () => {
  const module = await import('./-learning-review-source')
  return { default: module.LearningReviewSource }
})

type PreparedReview = Awaited<ReturnType<DesktopLearningApi['prepareReview']>>
type ReviewRating = keyof PreparedReview['outcomes']

interface ActiveReview {
  forgottenItemBlockIds: ReadonlySet<string>
  item: DesktopReviewItem
  revealed: boolean
  shownAt: number
  sourceVisible: boolean
  status: 'active'
  targetId: string
}

interface ReviewHistoryEntry {
  events: readonly { eventId: string, targetId: string }[]
  forgottenItemBlockIds: readonly string[]
  item: DesktopReviewItem
  targetId: string
}

type ReviewView = ActiveReview
  | { status: 'complete' }
  | { message: string, retry: 'next' | 'route', status: 'error' }
  | { status: 'loading' }

const ratings: readonly ReviewRating[] = ['again', 'hard', 'good', 'easy']

const cardSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.24,
} as const

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function baseSearch(search: LearningReviewSearch): LearningReviewSearch {
  return search.scope === 'note'
    ? { scope: 'note', scopeNoteId: search.scopeNoteId }
    : { scope: 'global' }
}

function restoreInput(search: LearningReviewSearch): RestoreDesktopReviewItemInput | null {
  if (!search.cardId)
    return null
  if (!search.noteId || !search.presentation || !search.targetId || !search.topicId)
    throw new Error('Validated Review search is missing its Card identity')
  return {
    cardId: search.cardId,
    noteId: search.noteId,
    presentation: search.presentation,
    targetId: search.targetId,
    topicId: search.topicId,
  }
}

function positionSearch(
  scope: LearningReviewSearch,
  item: DesktopReviewItem,
  targetId: string,
): LearningReviewSearch {
  return {
    ...baseSearch(scope),
    cardId: item.queue.cardId,
    noteId: item.queue.noteId,
    presentation: item.queue.presentation,
    targetId,
    topicId: item.queue.topicId,
  }
}

function searchIdentity(search: LearningReviewSearch): string {
  return JSON.stringify([
    search.scope,
    search.scopeNoteId,
    search.noteId,
    search.topicId,
    search.cardId,
    search.presentation,
    search.targetId,
  ])
}

function firstTargetId(item: DesktopReviewItem): string {
  const target = item.targets[0]
  if (!target)
    throw new Error(`Review Card ${item.queue.cardId} does not contain a Review Target`)
  return target.targetId
}

function assertTarget(item: DesktopReviewItem, targetId: string): void {
  if (!item.targets.some(target => target.targetId === targetId))
    throw new Error(`Review Card ${item.queue.cardId} does not contain Target ${targetId}`)
}

function isForwardItemCard(item: DesktopReviewItem): boolean {
  return (item.card.kind === 'list' || item.card.kind === 'set')
    && item.card.direction === 'forward'
}

function isSequentialList(item: DesktopReviewItem): boolean {
  return item.card.kind === 'list'
    && item.card.direction === 'forward'
    && item.queue.presentation === 'full'
}

function isBatchSet(item: DesktopReviewItem): boolean {
  return item.card.kind === 'set'
    && item.card.direction === 'forward'
    && item.queue.presentation === 'full'
}

function targetIdsForRating(item: DesktopReviewItem, targetId: string): readonly string[] {
  return isBatchSet(item)
    ? item.targets.map(target => target.targetId)
    : [targetId]
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
  active: ActiveReview,
  byTarget: ReadonlyMap<string, PreparedReview>,
  rating: ReviewRating,
  t: TFunction,
): string {
  const intervals = targetIdsForRating(active.item, active.targetId).map((targetId) => {
    const prepared = byTarget.get(targetId)
    if (!prepared)
      throw new Error(`Review Target ${targetId} is missing its prepared outcomes`)
    const target = active.item.targets.find(candidate => candidate.targetId === targetId)
    if (!target)
      throw new Error(`Review Target ${targetId} is missing from the active Card`)
    const selectedRating = isBatchSet(active.item)
      && rating !== 'again'
      && target.itemBlockId !== null
      && active.forgottenItemBlockIds.has(target.itemBlockId)
      ? 'again'
      : rating
    return prepared.outcomes[selectedRating].intervalMilliseconds
  })
  const minimum = Math.min(...intervals)
  const maximum = Math.max(...intervals)
  const first = formatInterval(minimum, t)
  return minimum === maximum ? first : `${first} - ${formatInterval(maximum, t)}`
}

function revealedItemBlockIds(active: ActiveReview): readonly string[] | undefined {
  if (!isForwardItemCard(active.item))
    return undefined
  const card = active.item.card
  if (card.kind !== 'list' && card.kind !== 'set')
    throw new Error('Forward item Card does not contain item projections')

  if (active.item.queue.presentation === 'partial') {
    const target = active.item.targets.find(candidate => candidate.targetId === active.targetId)
    if (!target?.itemBlockId)
      throw new Error(`Partial Review Target ${active.targetId} does not map to a Card item`)
    return active.revealed
      ? card.items.map(item => item.blockId)
      : card.items.filter(item => item.blockId !== target.itemBlockId).map(item => item.blockId)
  }

  if (card.kind === 'set')
    return active.revealed ? card.items.map(item => item.blockId) : []

  const targetIndex = active.item.targets.findIndex(target => target.targetId === active.targetId)
  if (targetIndex < 0)
    throw new Error(`List Review Target ${active.targetId} is unavailable`)
  return card.items.slice(0, targetIndex + (active.revealed ? 1 : 0)).map(item => item.blockId)
}

function ignoresReviewShortcut(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest('button, a, input, select, textarea, [contenteditable="true"]') !== null
}

export function LearningReviewWorkspace({
  replaceSearch,
  search,
}: {
  replaceSearch: (search: LearningReviewSearch) => void
  search: LearningReviewSearch
}) {
  const { t } = useTranslation('learning')
  const queryClient = useQueryClient()
  const shouldReduceMotion = useReducedMotion()
  const [view, setView] = useState<ReviewView>({ status: 'loading' })
  const [history, setHistory] = useState<readonly ReviewHistoryEntry[]>([])
  const [actionPending, setActionPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [routeRetryRevision, setRouteRetryRevision] = useState(0)
  const [preparationRevision, setPreparationRevision] = useState(0)
  const [prepared, setPrepared] = useState<{
    byTarget: ReadonlyMap<string, PreparedReview>
    key: string
  } | null>(null)
  const [preparationError, setPreparationError] = useState<string | null>(null)
  const publishedSearchRef = useRef<string | null>(null)
  const routeRequestRef = useRef(0)
  const scopeInput = useMemo(() => search.scope === 'note'
    ? { noteId: search.scopeNoteId }
    : {}, [search.scope, search.scopeNoteId])
  const routeIdentity = searchIdentity(search)
  const progressQuery = useQuery({
    queryFn: () => window.desktop.learning.getDailyProgress(),
    queryKey: learningQueryKeys.dailyProgress,
    refetchOnMount: 'always',
  })

  const publish = useCallback((next: LearningReviewSearch) => {
    publishedSearchRef.current = searchIdentity(next)
    replaceSearch(next)
  }, [replaceSearch])

  const activate = useCallback((
    item: DesktopReviewItem,
    targetId: string,
    options: { forgottenItemBlockIds?: readonly string[], revealed?: boolean } = {},
  ) => {
    assertTarget(item, targetId)
    setPrepared(null)
    setPreparationError(null)
    setActionError(null)
    setView({
      forgottenItemBlockIds: new Set(options.forgottenItemBlockIds),
      item,
      revealed: options.revealed === true,
      shownAt: Date.now(),
      sourceVisible: false,
      status: 'active',
      targetId,
    })
    publish(positionSearch(search, item, targetId))
  }, [publish, search])

  const loadNext = useCallback(async () => {
    setView({ status: 'loading' })
    setActionError(null)
    try {
      const next = await window.desktop.learning.getNextItem(scopeInput)
      if (!next) {
        setView({ status: 'complete' })
        publish(baseSearch(search))
        return
      }
      activate(next, firstTargetId(next))
    }
    catch (error) {
      setView({ message: errorMessage(error), retry: 'next', status: 'error' })
    }
  }, [activate, publish, scopeInput, search])

  useEffect(() => {
    if (publishedSearchRef.current === routeIdentity) {
      publishedSearchRef.current = null
      return
    }

    const request = routeRequestRef.current + 1
    routeRequestRef.current = request
    setView({ status: 'loading' })
    setHistory([])
    setActionError(null)
    const savedPosition = restoreInput(search)
    void (async () => {
      const restored = savedPosition
        ? await window.desktop.learning.restoreReviewItem(savedPosition)
        : null
      const item = restored ?? await window.desktop.learning.getNextItem(scopeInput)
      if (routeRequestRef.current !== request)
        return
      if (!item) {
        setView({ status: 'complete' })
        if (savedPosition)
          publish(baseSearch(search))
        return
      }
      const targetId = restored && savedPosition
        ? savedPosition.targetId
        : firstTargetId(item)
      activate(item, targetId)
    })().catch((error) => {
      if (routeRequestRef.current === request)
        setView({ message: errorMessage(error), retry: 'route', status: 'error' })
    })
  }, [activate, publish, routeIdentity, routeRetryRevision, scopeInput, search])

  const preparationItem = view.status === 'active' ? view.item : null
  const preparationTargetId = view.status === 'active' ? view.targetId : null
  const preparationVisible = view.status === 'active' && view.revealed
  const preparationTargetIds = useMemo(() => (
    preparationItem && preparationTargetId && preparationVisible
      ? targetIdsForRating(preparationItem, preparationTargetId)
      : []
  ), [preparationItem, preparationTargetId, preparationVisible])
  const preparationKey = view.status === 'active' && view.revealed
    ? JSON.stringify([
        view.item.queue.cardId,
        view.targetId,
        preparationTargetIds,
        preparationRevision,
      ])
    : ''

  useEffect(() => {
    if (preparationKey.length === 0) {
      setPrepared(null)
      setPreparationError(null)
      return
    }
    let active = true
    setPrepared(null)
    setPreparationError(null)
    void Promise.all(preparationTargetIds.map(async targetId => (
      [targetId, await window.desktop.learning.prepareReview({ targetId })] as const
    ))).then((entries) => {
      if (active)
        setPrepared({ byTarget: new Map(entries), key: preparationKey })
    }, (error) => {
      if (active)
        setPreparationError(t('prepareReviewFailed', { message: errorMessage(error) }))
    })
    return () => {
      active = false
    }
  }, [preparationKey, preparationTargetIds, t])

  const completeRatings = useCallback(async (
    active: ActiveReview,
    rating: ReviewRating,
    byTarget: ReadonlyMap<string, PreparedReview>,
  ): Promise<readonly { eventId: string, targetId: string }[]> => {
    const committed: Array<{ eventId: string, targetId: string }> = []
    const responseMilliseconds = Math.max(0, Date.now() - active.shownAt)
    try {
      for (const targetId of targetIdsForRating(active.item, active.targetId)) {
        const preparation = byTarget.get(targetId)
        if (!preparation)
          throw new Error(`Review Target ${targetId} was not prepared`)
        const target = active.item.targets.find(candidate => candidate.targetId === targetId)
        if (!target)
          throw new Error(`Review Target ${targetId} is missing from the active Card`)
        const selectedRating = isBatchSet(active.item)
          && rating !== 'again'
          && target.itemBlockId !== null
          && active.forgottenItemBlockIds.has(target.itemBlockId)
          ? 'again'
          : rating
        const result = await window.desktop.learning.rateTarget({
          eventId: preparation.eventId,
          expectedOptimizerRevisionId: preparation.expectedOptimizerRevisionId,
          expectedStateHash: preparation.expectedStateHash,
          expectedWinningEventId: preparation.expectedWinningEventId,
          rating: selectedRating,
          responseMilliseconds,
          reviewedAt: preparation.reviewedAt,
          targetId,
        })
        committed.push({ eventId: result.eventId, targetId })
      }
      return committed
    }
    catch (ratingError) {
      const rollbackErrors: unknown[] = []
      for (const event of [...committed].reverse()) {
        try {
          await window.desktop.learning.undoLastReview({
            expectedReviewEventId: event.eventId,
            targetId: event.targetId,
          })
        }
        catch (rollbackError) {
          rollbackErrors.push(rollbackError)
        }
      }
      if (rollbackErrors.length > 0)
        throw new AggregateError([ratingError, ...rollbackErrors], 'Rating failed and could not be fully rolled back')
      throw ratingError
    }
  }, [])

  const rate = useCallback(async (rating: ReviewRating) => {
    if (view.status !== 'active' || !view.revealed || actionPending)
      return
    if (!prepared || prepared.key !== preparationKey)
      return

    setActionPending(true)
    setActionError(null)
    try {
      const events = await completeRatings(view, rating, prepared.byTarget)
      setHistory(current => [...current, {
        events,
        forgottenItemBlockIds: [...view.forgottenItemBlockIds],
        item: view.item,
        targetId: view.targetId,
      }])
      void queryClient.invalidateQueries({ queryKey: learningQueryKeys.dailyProgress })

      if (isSequentialList(view.item)) {
        const targetIndex = view.item.targets.findIndex(target => target.targetId === view.targetId)
        const nextTarget = view.item.targets[targetIndex + 1]
        if (nextTarget) {
          activate(view.item, nextTarget.targetId)
          return
        }
      }

      await loadNext()
    }
    catch (error) {
      setActionError(t('rateReviewFailed', { message: errorMessage(error) }))
      setPreparationRevision(revision => revision + 1)
    }
    finally {
      setActionPending(false)
    }
  }, [
    actionPending,
    activate,
    completeRatings,
    loadNext,
    preparationKey,
    prepared,
    queryClient,
    t,
    view,
  ])

  const undo = useCallback(async () => {
    const previous = history.at(-1)
    if (!previous || actionPending)
      return
    setActionPending(true)
    setActionError(null)
    try {
      for (const event of [...previous.events].reverse()) {
        await window.desktop.learning.undoLastReview({
          expectedReviewEventId: event.eventId,
          targetId: event.targetId,
        })
      }
      setHistory(current => current.slice(0, -1))
      activate(previous.item, previous.targetId, {
        forgottenItemBlockIds: previous.forgottenItemBlockIds,
        revealed: true,
      })
      void queryClient.invalidateQueries({ queryKey: learningQueryKeys.dailyProgress })
    }
    catch (error) {
      setView({ message: errorMessage(error), retry: 'route', status: 'error' })
    }
    finally {
      setActionPending(false)
    }
  }, [actionPending, activate, history, queryClient])

  useEffect(() => {
    if (view.status !== 'active' || actionPending)
      return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || ignoresReviewShortcut(event.target))
        return
      if (!view.revealed && event.code === 'Space') {
        event.preventDefault()
        setView(current => current.status === 'active'
          ? { ...current, revealed: true, sourceVisible: false }
          : current)
        return
      }
      const rating = event.key === '1'
        ? 'again'
        : event.key === '2' ? 'hard' : event.key === '3' ? 'good' : event.key === '4' ? 'easy' : null
      if (view.revealed && rating) {
        event.preventDefault()
        void rate(rating)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [actionPending, rate, view])

  if (view.status === 'loading') {
    return (
      <div {...stylex.props(styles.centeredStatus)} role="status">
        <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={18} />
        <span>{t('loadingReview')}</span>
      </div>
    )
  }

  if (view.status === 'error') {
    return (
      <div {...stylex.props(styles.centeredStatus, styles.errorStatus)} role="alert">
        <p {...stylex.props(styles.statusTitle)}>{t('reviewUnavailable')}</p>
        <p {...stylex.props(styles.statusMessage)}>{view.message}</p>
        <div {...stylex.props(styles.statusActions)}>
          <Link {...stylex.props(styles.secondaryButton)} search={{}} to="/learning">{t('backToLearning')}</Link>
          <button
            {...stylex.props(styles.primaryButton)}
            type="button"
            onClick={() => {
              if (view.retry === 'next')
                void loadNext()
              else
                setRouteRetryRevision(revision => revision + 1)
            }}
          >
            {t('retry')}
          </button>
        </div>
      </div>
    )
  }

  if (view.status === 'complete') {
    return (
      <div {...stylex.props(styles.completion)}>
        <span {...stylex.props(styles.completionIcon)}><Check aria-hidden="true" size={28} strokeWidth={1.8} /></span>
        <h1 {...stylex.props(styles.completionTitle)}>{t('reviewComplete')}</h1>
        <p {...stylex.props(styles.completionMessage)}>{t(search.scope === 'note' ? 'noteReviewCompleteDescription' : 'globalReviewCompleteDescription')}</p>
        <div {...stylex.props(styles.statusActions)}>
          {history.length > 0
            ? (
                <button
                  {...stylex.props(styles.secondaryButton)}
                  disabled={actionPending}
                  type="button"
                  onClick={() => void undo()}
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
      </div>
    )
  }

  const active = view
  const currentTargetIndex = active.item.targets.findIndex(target => target.targetId === active.targetId)
  if (currentTargetIndex < 0)
    throw new Error(`Active Review Target ${active.targetId} is unavailable`)
  const cardPosition = isSequentialList(active.item)
    ? t('cardItemProgress', { count: currentTargetIndex + 1, total: active.item.targets.length })
    : t(`phase.${active.item.queue.phase}`)
  const dailyProgress = progressQuery.data
  const progressMaximum = dailyProgress ? Math.max(dailyProgress.dailyGoalCards, dailyProgress.completedCards, 1) : 1
  const progressValue = dailyProgress ? Math.min(progressMaximum, dailyProgress.completedCards) : 0
  const activePrepared = prepared?.key === preparationKey ? prepared.byTarget : null
  const visibleItemIds = revealedItemBlockIds(active)
  const itemSelection: CardPreviewItemSelection | undefined = isBatchSet(active.item) && active.revealed
    ? {
        label: (_itemBlockId, selected) => t(selected ? 'markItemRemembered' : 'markItemForgotten'),
        onToggle: (itemBlockId) => {
          setView((current) => {
            if (current.status !== 'active')
              return current
            const forgotten = new Set(current.forgottenItemBlockIds)
            if (forgotten.has(itemBlockId))
              forgotten.delete(itemBlockId)
            else
              forgotten.add(itemBlockId)
            return { ...current, forgottenItemBlockIds: forgotten }
          })
        },
        selectedItemBlockIds: [...active.forgottenItemBlockIds],
      }
    : undefined
  const materialKey = `${active.item.queue.cardId}:${active.targetId}:${active.sourceVisible ? 'source' : active.revealed ? 'back' : 'front'}`

  return (
    <div {...stylex.props(styles.session)}>
      <header {...stylex.props(styles.sessionBar)}>
        <Link
          {...stylex.props(styles.iconButton)}
          aria-label={t('closeReview')}
          search={{}}
          title={t('closeReview')}
          to="/learning"
        >
          <X aria-hidden="true" size={17} strokeWidth={1.9} />
        </Link>
        <div {...stylex.props(styles.identity)}>
          <span {...stylex.props(styles.scopeLabel)}>
            {search.scope === 'global' ? t('globalReview') : t('noteReview')}
          </span>
          <span {...stylex.props(styles.location)}>
            <span {...stylex.props(styles.locationText)}>{active.item.noteTitle}</span>
            {active.item.topicTitle === active.item.noteTitle
              ? null
              : (
                  <>
                    <ChevronRight {...stylex.props(styles.locationChevron)} aria-hidden="true" size={12} strokeWidth={1.9} />
                    <span {...stylex.props(styles.locationText)}>{active.item.topicTitle}</span>
                  </>
                )}
          </span>
        </div>
        <div {...stylex.props(styles.sessionMeta)}>
          <span {...stylex.props(styles.cardPosition)}>{cardPosition}</span>
          <div
            {...stylex.props(styles.progressTrack)}
            aria-label={t('dailyProgress')}
            aria-valuemax={progressMaximum}
            aria-valuemin={0}
            aria-valuenow={progressValue}
            role="progressbar"
          >
            <motion.span
              {...stylex.props(styles.progressFill)}
              animate={{ scaleX: progressValue / progressMaximum }}
              initial={false}
              transition={shouldReduceMotion ? { duration: 0 } : cardSpring}
            />
          </div>
          <button
            {...stylex.props(styles.iconButton)}
            aria-label={t('undoRating')}
            disabled={history.length === 0 || actionPending}
            title={t('undoRating')}
            type="button"
            onClick={() => void undo()}
          >
            <RotateCcw aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
          <button
            {...stylex.props(styles.iconButton, active.sourceVisible && styles.iconButtonActive)}
            aria-label={active.sourceVisible ? t('showCard') : t('showSource')}
            aria-pressed={active.sourceVisible}
            disabled={!active.revealed}
            title={active.sourceVisible ? t('showCard') : t('showSource')}
            type="button"
            onClick={() => setView(current => current.status === 'active'
              ? { ...current, sourceVisible: !current.sourceVisible }
              : current)}
          >
            <BookOpen aria-hidden="true" size={17} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      <div {...stylex.props(styles.materialViewport)}>
        <AnimatePresence initial={false} mode="wait">
          <motion.section
            key={materialKey}
            {...stylex.props(styles.material)}
            animate={{ opacity: 1, y: 0 }}
            aria-label={active.sourceVisible ? t('cardSource') : t('currentCard')}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={shouldReduceMotion ? { duration: 0.08 } : cardSpring}
          >
            {active.sourceVisible
              ? (
                  <Suspense fallback={<div {...stylex.props(styles.materialLoading)} role="status">{t('loadingSource')}</div>}>
                    <ReviewSource item={active.item} />
                  </Suspense>
                )
              : (
                  <CardPreview
                    appearance="embedded"
                    card={active.item.card}
                    itemSelection={itemSelection}
                    mode={active.revealed ? 'back' : 'front'}
                    revealedItemBlockIds={visibleItemIds}
                  />
                )}
          </motion.section>
        </AnimatePresence>
      </div>

      <div {...stylex.props(styles.dockRegion)}>
        <div {...stylex.props(styles.reviewDock)}>
          {actionError || preparationError
            ? <p {...stylex.props(styles.inlineError)} role="alert">{actionError ?? preparationError}</p>
            : null}
          {!active.revealed
            ? (
                <button
                  {...stylex.props(styles.showAnswerButton)}
                  type="button"
                  onClick={() => setView(current => current.status === 'active'
                    ? { ...current, revealed: true, sourceVisible: false }
                    : current)}
                >
                  {t('showAnswer')}
                </button>
              )
            : (
                <div {...stylex.props(styles.ratingGrid)} aria-label={t('rateCard')} role="group">
                  {ratings.map(rating => (
                    <button
                      key={rating}
                      {...stylex.props(styles.ratingButton, styles[`rating_${rating}`])}
                      disabled={actionPending || activePrepared === null}
                      type="button"
                      onClick={() => void rate(rating)}
                    >
                      <span {...stylex.props(styles.ratingInterval)}>
                        {activePrepared ? intervalLabel(active, activePrepared, rating, t) : '...'}
                      </span>
                      <span {...stylex.props(styles.ratingLabel)}>{t(`rating.${rating}`)}</span>
                    </button>
                  ))}
                </div>
              )}
          {actionPending
            ? <LoaderCircle {...stylex.props(styles.dockSpinner, styles.spinner)} aria-label={t('savingRating')} size={15} />
            : null}
        </div>
      </div>
    </div>
  )
}
