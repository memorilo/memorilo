import type { DesktopLearningApi, DesktopReviewItem } from '@memorilo/desktop-preload'

export type ReviewRating = 'again' | 'easy' | 'good' | 'hard'

export interface PreparedReview {
  eventId: string
  expectedOptimizerRevisionId: string
  expectedStateHash: string
  expectedWinningEventId: string | null
  outcomes: Record<ReviewRating, { intervalMilliseconds: number }>
  reviewedAt: number
  targetId: string
}

export interface ActiveReview {
  forgottenItemBlockIds: ReadonlySet<string>
  item: DesktopReviewItem
  listRatings: readonly ReviewRating[]
  revealed: boolean
  shownAt: number
  sourceVisible: boolean
  status: 'active'
  targetId: string
}

export interface ActivateReviewOptions {
  forgottenItemBlockIds?: readonly string[]
  listRatings?: readonly ReviewRating[]
  revealed?: boolean
  targetId?: string
}

export interface ReviewPreparationRequest {
  key: string
  targetIds: readonly string[]
}

export interface ReviewProjection {
  position:
    | { current: number, kind: 'sequential', total: number }
    | { kind: 'phase', phase: DesktopReviewItem['queue']['phase'] }
  supportsForgottenSelection: boolean
  visibleItemBlockIds: readonly string[] | undefined
}

export type ReviewRatingDecision
  = | { listRatings: readonly ReviewRating[], nextTargetId: string, status: 'advance' }
    | {
      status: 'committed'
      undoCommands: Parameters<DesktopLearningApi['undoReviews']>[0]['reviews']
    }

type RatingAdapter = Pick<DesktopLearningApi, 'rateMultiLineCard' | 'rateTarget' | 'undoReviews'>

export interface LearningReviewRatingModel {
  activate: (item: DesktopReviewItem, options?: ActivateReviewOptions) => ActiveReview
  preparation: (active: ActiveReview, revision: number) => ReviewPreparationRequest | null
  project: (active: ActiveReview) => ReviewProjection
  rate: (
    active: ActiveReview,
    rating: ReviewRating,
    prepared: ReadonlyMap<string, PreparedReview>,
  ) => Promise<ReviewRatingDecision>
  ratingIntervals: (
    active: ActiveReview,
    prepared: ReadonlyMap<string, PreparedReview>,
    rating: ReviewRating,
  ) => { maximum: number, minimum: number }
  toggleForgotten: (active: ActiveReview, itemBlockId: string) => ActiveReview
  undo: (commands: Parameters<DesktopLearningApi['undoReviews']>[0]['reviews']) => Promise<void>
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

function targetIdsForPreparation(item: DesktopReviewItem, targetId: string): readonly string[] {
  if (isBatchSet(item) || (isSequentialList(item) && item.targets.at(-1)?.targetId === targetId))
    return [...item.targets.map(target => target.targetId), item.mainTargetId]
  return targetIdsForRating(item, targetId)
}

function ratingForTarget(
  active: ActiveReview,
  target: DesktopReviewItem['targets'][number],
  rating: ReviewRating,
): ReviewRating {
  return isBatchSet(active.item)
    && rating !== 'again'
    && target.itemBlockId !== null
    && active.forgottenItemBlockIds.has(target.itemBlockId)
    ? 'again'
    : rating
}

function preparationToken(prepared: PreparedReview) {
  return {
    eventId: prepared.eventId,
    expectedOptimizerRevisionId: prepared.expectedOptimizerRevisionId,
    expectedStateHash: prepared.expectedStateHash,
    expectedWinningEventId: prepared.expectedWinningEventId,
    reviewedAt: prepared.reviewedAt,
    targetId: prepared.targetId,
  }
}

function requirePreparation(
  prepared: ReadonlyMap<string, PreparedReview>,
  targetId: string,
): PreparedReview {
  const preparation = prepared.get(targetId)
  if (!preparation)
    throw new Error(`Review Target ${targetId} is missing its prepared outcomes`)
  return preparation
}

export function createLearningReviewRatingModel(
  adapter: RatingAdapter,
  now: () => number = Date.now,
  createId: () => string = () => crypto.randomUUID(),
): LearningReviewRatingModel {
  let cachedPreparation: ReviewPreparationRequest | null = null

  const activate = (
    item: DesktopReviewItem,
    options: ActivateReviewOptions = {},
  ): ActiveReview => {
    const targetId = options.targetId ?? item.targets[0]?.targetId
    if (!targetId)
      throw new Error(`Review Card ${item.queue.cardId} does not contain a Review Target`)
    const targetIndex = item.targets.findIndex(target => target.targetId === targetId)
    if (targetIndex < 0)
      throw new Error(`Review Card ${item.queue.cardId} does not contain Target ${targetId}`)

    const listRatings = options.listRatings ?? []
    if (isSequentialList(item)) {
      if (listRatings.length !== targetIndex)
        throw new Error(`List Card ${item.queue.cardId} saved Ratings do not match its current item`)
    }
    else if (listRatings.length > 0) {
      throw new Error(`Review Card ${item.queue.cardId} cannot restore List Ratings`)
    }

    return {
      forgottenItemBlockIds: new Set(options.forgottenItemBlockIds),
      item,
      listRatings,
      revealed: options.revealed === true,
      shownAt: now(),
      sourceVisible: false,
      status: 'active',
      targetId,
    }
  }

  const preparation = (active: ActiveReview, revision: number): ReviewPreparationRequest | null => {
    if (!active.revealed)
      return null
    const targetIds = targetIdsForPreparation(active.item, active.targetId)
    const key = JSON.stringify([
      active.item.queue.cardId,
      active.listRatings,
      active.targetId,
      targetIds,
      revision,
    ])
    if (cachedPreparation?.key === key)
      return cachedPreparation
    cachedPreparation = { key, targetIds }
    return cachedPreparation
  }

  const project = (active: ActiveReview): ReviewProjection => {
    const currentTargetIndex = active.item.targets.findIndex(target => target.targetId === active.targetId)
    if (currentTargetIndex < 0)
      throw new Error(`Active Review Target ${active.targetId} is unavailable`)

    let visibleItemBlockIds: readonly string[] | undefined
    if (isForwardItemCard(active.item)) {
      const card = active.item.card
      if (card.kind !== 'list' && card.kind !== 'set')
        throw new Error('Forward item Card does not contain item projections')

      if (active.item.queue.presentation === 'partial') {
        const target = active.item.targets[currentTargetIndex]
        if (!target?.itemBlockId)
          throw new Error(`Partial Review Target ${active.targetId} does not map to a Card item`)
        visibleItemBlockIds = active.revealed
          ? card.items.map(item => item.blockId)
          : card.items.filter(item => item.blockId !== target.itemBlockId).map(item => item.blockId)
      }
      else if (card.kind === 'set') {
        visibleItemBlockIds = active.revealed ? card.items.map(item => item.blockId) : []
      }
      else {
        visibleItemBlockIds = card.items
          .slice(0, currentTargetIndex + (active.revealed ? 1 : 0))
          .map(item => item.blockId)
      }
    }

    return {
      position: isSequentialList(active.item)
        ? { current: currentTargetIndex + 1, kind: 'sequential', total: active.item.targets.length }
        : { kind: 'phase', phase: active.item.queue.phase },
      supportsForgottenSelection: isBatchSet(active.item) && active.revealed,
      visibleItemBlockIds,
    }
  }

  const ratingIntervals = (
    active: ActiveReview,
    prepared: ReadonlyMap<string, PreparedReview>,
    rating: ReviewRating,
  ): { maximum: number, minimum: number } => {
    const intervals = targetIdsForRating(active.item, active.targetId).map((targetId) => {
      const preparation = requirePreparation(prepared, targetId)
      const target = active.item.targets.find(candidate => candidate.targetId === targetId)
      if (!target)
        throw new Error(`Review Target ${targetId} is missing from the active Card`)
      return preparation.outcomes[ratingForTarget(active, target, rating)].intervalMilliseconds
    })
    return { maximum: Math.max(...intervals), minimum: Math.min(...intervals) }
  }

  const rate = async (
    active: ActiveReview,
    rating: ReviewRating,
    prepared: ReadonlyMap<string, PreparedReview>,
  ): Promise<ReviewRatingDecision> => {
    if (isSequentialList(active.item)) {
      const targetIndex = active.item.targets.findIndex(target => target.targetId === active.targetId)
      const nextTarget = active.item.targets[targetIndex + 1]
      if (nextTarget) {
        return {
          listRatings: [...active.listRatings, rating],
          nextTargetId: nextTarget.targetId,
          status: 'advance',
        }
      }
    }

    const responseMilliseconds = Math.max(0, now() - active.shownAt)
    if (isSequentialList(active.item) || isBatchSet(active.item)) {
      const itemRatings = isSequentialList(active.item)
        ? [...active.listRatings, rating]
        : active.item.targets.map(target => ratingForTarget(active, target, rating))
      if (itemRatings.length !== active.item.targets.length)
        throw new Error(`Multi-line Card ${active.item.queue.cardId} does not have one Rating per item`)

      const preparedItems = active.item.targets.map((target, index) => {
        const itemRating = itemRatings[index]
        if (!itemRating)
          throw new Error(`Multi-line item Target ${target.targetId} does not have a Rating`)
        return {
          ...preparationToken(requirePreparation(prepared, target.targetId)),
          rating: itemRating,
          responseMilliseconds,
        }
      })
      const result = await adapter.rateMultiLineCard({
        cardId: active.item.queue.cardId,
        itemRatings: preparedItems,
        mainPreparation: preparationToken(requirePreparation(prepared, active.item.mainTargetId)),
        responseMilliseconds,
        ...(isBatchSet(active.item) ? { setRating: rating } : {}),
      })
      const events = [...result.itemResults, result.mainResult]
      return {
        status: 'committed',
        undoCommands: events.map(review => ({
          eventId: createId(),
          expectedReviewEventId: review.eventId,
          targetId: review.state.targetId,
        })),
      }
    }

    const target = active.item.targets.find(candidate => candidate.targetId === active.targetId)
    if (!target)
      throw new Error(`Review Target ${active.targetId} is missing from the active Card`)
    const preparation = requirePreparation(prepared, active.targetId)
    const result = await adapter.rateTarget({
      ...preparationToken(preparation),
      rating: ratingForTarget(active, target, rating),
      responseMilliseconds,
    })
    return {
      status: 'committed',
      undoCommands: [{
        eventId: createId(),
        expectedReviewEventId: result.eventId,
        targetId: active.targetId,
      }],
    }
  }

  const toggleForgotten = (active: ActiveReview, itemBlockId: string): ActiveReview => {
    if (!isBatchSet(active.item) || !active.revealed)
      throw new Error('Forgotten item selection is only available for a revealed Set Card')
    if (!active.item.targets.some(target => target.itemBlockId === itemBlockId))
      throw new Error(`Set Card ${active.item.queue.cardId} does not contain item ${itemBlockId}`)
    const forgotten = new Set(active.forgottenItemBlockIds)
    if (forgotten.has(itemBlockId))
      forgotten.delete(itemBlockId)
    else
      forgotten.add(itemBlockId)
    return { ...active, forgottenItemBlockIds: forgotten }
  }

  const undo = async (
    commands: Parameters<DesktopLearningApi['undoReviews']>[0]['reviews'],
  ): Promise<void> => {
    if (commands.length > 0)
      await adapter.undoReviews({ reviews: commands })
  }

  return { activate, preparation, project, rate, ratingIntervals, toggleForgotten, undo }
}
