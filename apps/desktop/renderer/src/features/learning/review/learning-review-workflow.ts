import type { DesktopLearningApi, DesktopReviewItem } from '@memorilo/desktop-preload'
import type {
  ActiveReview,
  PreparedReview,
  ReviewProjection,
  ReviewRating,
} from './learning-review-rating-model'
import type {
  LearningReviewRoute,
  LearningReviewScope,
} from './learning-review-route'
import { createLearningReviewRatingModel } from './learning-review-rating-model'
import { learningReviewRoute } from './learning-review-route'
import { createLearningReviewSession } from './learning-review-session'

const ratings: readonly ReviewRating[] = ['again', 'hard', 'good', 'easy']

type LearningAdapterMethod
  = | 'getNextItem'
    | 'prepareReview'
    | 'rateMultiLineCard'
    | 'rateTarget'
    | 'restoreReviewItem'
    | 'undoReviews'

type LearningAdapter = Pick<DesktopLearningApi, LearningAdapterMethod>

interface ReviewHistoryEntry {
  forgottenItemBlockIds: readonly string[]
  item: DesktopReviewItem
  listRatings: readonly ReviewRating[]
  targetId: string
  undoCommands: Parameters<DesktopLearningApi['undoReviews']>[0]['reviews']
}

export interface LearningReviewFailure {
  cause: unknown
  operation: 'prepare' | 'rate' | 'undo'
}

export type LearningReviewView
  = ActiveReview
    | { status: 'complete' }
    | { cause: unknown, retry: 'next' | 'route', status: 'error' }
    | { status: 'loading' }

interface RatingInterval {
  maximum: number
  minimum: number
}

export interface LearningReviewSnapshot {
  actionError: LearningReviewFailure | null
  actionPending: boolean
  historyLength: number
  preparationError: LearningReviewFailure | null
  projection: ReviewProjection | null
  ratingIntervals: Readonly<Record<ReviewRating, RatingInterval>> | null
  scope: LearningReviewScope
  view: LearningReviewView
}

interface LearningReviewWorkflowOptions {
  initialRoute: LearningReviewRoute
  invalidateProgress: () => void
  learning: LearningAdapter
  replaceRoute: (route: LearningReviewRoute) => void
}

/** Owns the review state machine and exposes the complete page interaction seam. */
export function createLearningReviewWorkflow({
  initialRoute,
  invalidateProgress,
  learning,
  replaceRoute,
}: LearningReviewWorkflowOptions) {
  const session = createLearningReviewSession()
  const ratingModel = createLearningReviewRatingModel(learning)
  const listeners = new Set<() => void>()
  let actionError: LearningReviewFailure | null = null
  let actionPending = false
  let currentRoute = initialRoute
  let history: readonly ReviewHistoryEntry[] = []
  let preparationError: LearningReviewFailure | null = null
  let preparationRevision = 0
  let prepared: { byTarget: ReadonlyMap<string, PreparedReview>, key: string } | null = null
  let publishedRouteIdentity: string | null = null
  let view: LearningReviewView = { status: 'loading' }

  const buildSnapshot = (): LearningReviewSnapshot => {
    const active = view.status === 'active' ? view : null
    const projection = active ? ratingModel.project(active) : null
    const request = active
      ? ratingModel.preparation(active, preparationRevision)
      : null
    const activePrepared = request && prepared?.key === request.key ? prepared.byTarget : null
    const ratingIntervals = active && activePrepared
      ? Object.fromEntries(
        ratings.map(rating => [rating, ratingModel.ratingIntervals(active, activePrepared, rating)]),
      ) as Record<ReviewRating, RatingInterval>
      : null
    return {
      actionError,
      actionPending,
      historyLength: history.length,
      preparationError,
      projection,
      ratingIntervals,
      scope: currentRoute.scope,
      view,
    }
  }

  let currentSnapshot = buildSnapshot()

  const emit = (): void => {
    currentSnapshot = buildSnapshot()
    for (const listener of listeners) {
      try {
        listener()
      }
      catch {
        // Subscribers are observational and must not break review ownership.
      }
    }
  }

  const invalidateProgressSafely = (): void => {
    try {
      invalidateProgress()
    }
    catch {
      // Cache invalidation is observational; persistence has already committed.
    }
  }

  const publish = (route: LearningReviewRoute): void => {
    publishedRouteIdentity = learningReviewRoute.identity(route)
    try {
      replaceRoute(route)
    }
    catch (cause) {
      publishedRouteIdentity = null
      view = { cause, retry: 'route', status: 'error' }
      emit()
    }
  }

  const scopeInput = (route: LearningReviewRoute): { noteId?: string } => (
    route.scope === 'note' ? { noteId: route.scopeNoteId } : {}
  )

  const prepareActive = (): void => {
    const active = view.status === 'active' ? view : null
    const request = active ? ratingModel.preparation(active, preparationRevision) : null
    if (!request) {
      session.invalidatePreparation()
      prepared = null
      preparationError = null
      emit()
      return
    }

    prepared = null
    preparationError = null
    emit()
    void (async () => {
      try {
        const result = await session.prepare(() => Promise.all(request.targetIds.map(async targetId => (
          [targetId, await learning.prepareReview({ targetId })] as const
        ))))
        if (result.status !== 'current')
          return
        prepared = { byTarget: new Map(result.value), key: request.key }
        emit()
      }
      catch (cause) {
        if (!session.isActive())
          return
        preparationError = { cause, operation: 'prepare' }
        emit()
      }
    })()
  }

  const activate = (
    item: DesktopReviewItem,
    targetId?: string,
    options: {
      forgottenItemBlockIds?: readonly string[]
      listRatings?: readonly ReviewRating[]
      revealed?: boolean
    } = {},
  ): void => {
    const active = ratingModel.activate(item, { ...options, targetId })
    actionError = null
    prepared = null
    preparationError = null
    view = active
    publish(learningReviewRoute.position(currentRoute, item, active.targetId, active.listRatings))
    emit()
    prepareActive()
  }

  const loadNext = async (): Promise<void> => {
    actionError = null
    view = { status: 'loading' }
    emit()
    try {
      const result = await session.route(() => learning.getNextItem(scopeInput(currentRoute)))
      if (result.status === 'superseded')
        return
      if (!result.value) {
        view = { status: 'complete' }
        publish(learningReviewRoute.base(currentRoute))
        emit()
        return
      }
      activate(result.value)
    }
    catch (cause) {
      if (!session.isActive())
        return
      view = { cause, retry: 'next', status: 'error' }
      emit()
    }
  }

  const loadRoute = (route: LearningReviewRoute): void => {
    session.invalidateAction()
    session.invalidatePreparation()
    actionError = null
    history = []
    prepared = null
    preparationError = null
    view = { status: 'loading' }
    emit()
    const savedPosition = learningReviewRoute.restore(route)
    void (async () => {
      try {
        const result = await session.route(async () => {
          const restored = savedPosition
            ? await learning.restoreReviewItem(savedPosition)
            : null
          return {
            item: restored ?? await learning.getNextItem(scopeInput(route)),
            restored,
          }
        })
        if (result.status === 'superseded')
          return
        const { item, restored } = result.value
        if (!item) {
          view = { status: 'complete' }
          if (savedPosition)
            publish(learningReviewRoute.base(route))
          emit()
          return
        }
        activate(item, restored && savedPosition ? savedPosition.targetId : undefined, {
          listRatings: restored && savedPosition ? learningReviewRoute.savedRatings(route) : [],
        })
      }
      catch (cause) {
        if (!session.isActive())
          return
        view = { cause, retry: 'route', status: 'error' }
        emit()
      }
    })()
  }

  const setRoute = (route: LearningReviewRoute): void => {
    if (!session.isActive())
      return
    currentRoute = route
    const identity = learningReviewRoute.identity(route)
    if (publishedRouteIdentity === identity) {
      publishedRouteIdentity = null
      currentSnapshot = buildSnapshot()
      return
    }
    loadRoute(route)
  }

  const rate = async (rating: ReviewRating): Promise<void> => {
    if (!session.isActive() || actionPending || view.status !== 'active' || !view.revealed)
      return
    const active = view
    const request = ratingModel.preparation(active, preparationRevision)
    if (!request || prepared?.key !== request.key)
      return
    const preparedByTarget = prepared.byTarget

    actionPending = true
    actionError = null
    emit()
    try {
      const result = await session.action(() => ratingModel.rate(active, rating, preparedByTarget))
      if (result.status !== 'accepted')
        return
      const decision = result.value
      history = [...history, {
        forgottenItemBlockIds: [...active.forgottenItemBlockIds],
        item: active.item,
        listRatings: active.listRatings,
        targetId: active.targetId,
        undoCommands: decision.status === 'committed' ? decision.undoCommands : [],
      }]
      if (decision.status === 'advance') {
        activate(active.item, decision.nextTargetId, { listRatings: decision.listRatings })
        return
      }
      invalidateProgressSafely()
      await loadNext()
    }
    catch (cause) {
      if (!session.isActive())
        return
      actionError = { cause, operation: 'rate' }
      preparationRevision += 1
      emit()
      prepareActive()
    }
    finally {
      if (session.isActive()) {
        actionPending = false
        emit()
      }
    }
  }

  const undo = async (): Promise<void> => {
    const previous = history.at(-1)
    if (!previous || actionPending || !session.isActive())
      return
    actionPending = true
    actionError = null
    emit()
    try {
      const result = await session.action(() => ratingModel.undo(previous.undoCommands))
      if (result.status !== 'accepted')
        return
      history = history.slice(0, -1)
      activate(previous.item, previous.targetId, {
        forgottenItemBlockIds: previous.forgottenItemBlockIds,
        listRatings: previous.listRatings,
        revealed: true,
      })
      invalidateProgressSafely()
    }
    catch (cause) {
      if (!session.isActive())
        return
      actionError = { cause, operation: 'undo' }
      emit()
    }
    finally {
      if (session.isActive()) {
        actionPending = false
        emit()
      }
    }
  }

  const close = (): Promise<void> => {
    const closing = session.close()
    listeners.clear()
    return closing
  }

  return {
    close,
    rate,
    retry: () => {
      if (!session.isActive() || view.status !== 'error')
        return
      if (view.retry === 'next')
        void loadNext()
      else
        loadRoute(currentRoute)
    },
    reveal: () => {
      if (!session.isActive() || view.status !== 'active' || view.revealed)
        return
      view = { ...view, revealed: true, sourceVisible: false }
      emit()
      prepareActive()
    },
    setRoute,
    snapshot: () => currentSnapshot,
    subscribe: (listener: () => void) => {
      if (!session.isActive())
        return () => undefined
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    toggleForgotten: (itemBlockId: string) => {
      if (!session.isActive() || view.status !== 'active')
        return
      view = ratingModel.toggleForgotten(view, itemBlockId)
      emit()
    },
    toggleSource: () => {
      if (
        !session.isActive()
        || view.status !== 'active'
        || view.item.card.kind === 'image-occlusion'
      ) {
        return
      }
      view = { ...view, sourceVisible: !view.sourceVisible }
      emit()
    },
    undo,
  }
}

export type LearningReviewWorkflow = ReturnType<typeof createLearningReviewWorkflow>
