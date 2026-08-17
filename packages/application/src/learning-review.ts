import type {
  LearningQueueItem,
  LearningReviewStorage,
  LearningTarget,
  ReviewRating,
  UndoLearningReviewCommand,
} from '@memorilo/editor-storage'
import type { ReviewCardProjection } from '@memorilo/editor/card'
import type { EditorNoteCardProjection } from './note-card-projection'

export type { ReviewRating }

export interface PreparedLearningReview {
  eventId: string
  expectedOptimizerRevisionId: string
  expectedStateHash: string
  expectedWinningEventId: string | null
  outcomes: Record<ReviewRating, { intervalMilliseconds: number }>
  reviewedAt: number
  targetId: string
}

export interface LearningReviewTarget {
  itemBlockId: string | null
  targetId: string
}

export interface LearningReviewItem {
  card: ReviewCardProjection
  mainTargetId: string
  noteTitle: string
  queue: LearningQueueItem
  targets: readonly LearningReviewTarget[]
  topicTitle: string
  updatedAt: number
}

export interface ActiveLearningReview {
  forgottenItemBlockIds: ReadonlySet<string>
  item: LearningReviewItem
  listRatings: readonly ReviewRating[]
  revealed: boolean
  shownAt: number
  sourceVisible: boolean
  status: 'active'
  targetId: string
}

export interface ActivateLearningReviewOptions {
  forgottenItemBlockIds?: readonly string[]
  listRatings?: readonly ReviewRating[]
  revealed?: boolean
  targetId?: string
}

export interface ReviewPreparationRequest {
  key: string
  targetIds: readonly string[]
}

export interface LearningReviewProjection {
  position:
    | { current: number, kind: 'sequential', total: number }
    | { kind: 'phase', phase: LearningQueueItem['phase'] }
  supportsForgottenSelection: boolean
  visibleItemBlockIds: readonly string[] | undefined
}

export type LearningReviewRatingDecision
  = | { listRatings: readonly ReviewRating[], nextTargetId: string, status: 'advance' }
    | { status: 'committed', undoCommands: readonly UndoLearningReviewCommand[] }

type RatingAdapter = Pick<LearningReviewStorage, 'rateMultiLineCard' | 'rateTarget' | 'undoMany'>

export interface LearningReviewRatingModel {
  activate: (item: LearningReviewItem, options?: ActivateLearningReviewOptions) => ActiveLearningReview
  preparation: (active: ActiveLearningReview, revision: number) => ReviewPreparationRequest | null
  project: (active: ActiveLearningReview) => LearningReviewProjection
  rate: (
    active: ActiveLearningReview,
    rating: ReviewRating,
    prepared: ReadonlyMap<string, PreparedLearningReview>,
  ) => Promise<LearningReviewRatingDecision>
  ratingIntervals: (
    active: ActiveLearningReview,
    prepared: ReadonlyMap<string, PreparedLearningReview>,
    rating: ReviewRating,
  ) => { maximum: number, minimum: number }
  toggleForgotten: (active: ActiveLearningReview, itemBlockId: string) => ActiveLearningReview
  undo: (commands: readonly UndoLearningReviewCommand[]) => Promise<void>
}

function unavailable(queue: LearningQueueItem, reason: string): Error {
  return new Error(`Review Card ${queue.cardId} is unavailable: ${reason}`)
}

export function resolveLearningReviewItem(
  projection: EditorNoteCardProjection,
  queue: LearningQueueItem,
  cardTargets: readonly LearningTarget[],
): LearningReviewItem {
  const card = projection.card
  if (card.sourceBlockId !== queue.sourceBlockId)
    throw unavailable(queue, 'its Source Block changed while the Queue was being resolved')
  const activeTargets = cardTargets.filter(target => target.active && target.cardId === queue.cardId)
  const mainTargets = activeTargets.filter(target => target.kind === 'whole')
  const mainTarget = mainTargets[0]
  if (mainTargets.length !== 1 || !mainTarget || mainTarget.itemBlockId !== null)
    throw unavailable(queue, 'the Card must contain exactly one active main Target')
  const targetById = new Map(cardTargets.map(target => [target.targetId, target]))
  const seen = new Set<string>()
  const targets = queue.targetIds.map((targetId) => {
    if (seen.has(targetId))
      throw unavailable(queue, `the Queue contains duplicate Target ${targetId}`)
    seen.add(targetId)
    const target = targetById.get(targetId)
    if (!target || !activeTargets.includes(target))
      throw unavailable(queue, `Target ${targetId} is no longer active`)
    return target
  })
  if (targets.length === 0)
    throw unavailable(queue, 'the Queue item contains no Review Targets')

  if (queue.presentation === 'partial') {
    const target = targets[0]
    if (targets.length !== 1 || !target || target.kind !== 'item' || target.itemBlockId === null)
      throw unavailable(queue, 'a Partial presentation requires exactly one item Target')
    if ((card.kind !== 'list' && card.kind !== 'set') || card.direction !== 'forward')
      throw unavailable(queue, 'a Partial presentation requires a forward List or Set Card')
    if (!card.items.some(item => item.blockId === target.itemBlockId))
      throw unavailable(queue, `item Block ${target.itemBlockId} is missing from the Card projection`)
  }
  else if (targets[0]?.kind === 'item') {
    if ((card.kind !== 'list' && card.kind !== 'set') || card.direction !== 'forward')
      throw unavailable(queue, 'item Targets require a forward List or Set Card')
    const itemBlockIds = targets.map((target) => {
      if (target.kind !== 'item' || target.itemBlockId === null)
        throw unavailable(queue, 'a full List or Set presentation mixes whole and item Targets')
      return target.itemBlockId
    })
    if (itemBlockIds.length !== card.items.length
      || itemBlockIds.some((itemBlockId, index) => itemBlockId !== card.items[index]?.blockId)) {
      throw unavailable(queue, 'item Targets do not match the current Card projection')
    }
  }
  else if (targets.length !== 1 || targets[0]?.targetId !== mainTarget.targetId) {
    throw unavailable(queue, 'a whole Card presentation requires exactly one whole Target')
  }

  return {
    card,
    mainTargetId: mainTarget.targetId,
    noteTitle: projection.noteTitle,
    queue,
    targets: targets.map(target => ({
      itemBlockId: target.itemBlockId,
      targetId: target.targetId,
    })),
    topicTitle: projection.topicTitle,
    updatedAt: projection.updatedAt,
  }
}

function isForwardItemCard(item: LearningReviewItem): boolean {
  return (item.card.kind === 'list' || item.card.kind === 'set')
    && item.card.direction === 'forward'
}

function isSequentialList(item: LearningReviewItem): boolean {
  return item.card.kind === 'list'
    && item.card.direction === 'forward'
    && item.queue.presentation === 'full'
}

function isBatchSet(item: LearningReviewItem): boolean {
  return item.card.kind === 'set'
    && item.card.direction === 'forward'
    && item.queue.presentation === 'full'
}

function targetIdsForRating(item: LearningReviewItem, targetId: string): readonly string[] {
  return isBatchSet(item)
    ? item.targets.map(target => target.targetId)
    : [targetId]
}

function targetIdsForPreparation(item: LearningReviewItem, targetId: string): readonly string[] {
  if (isBatchSet(item) || (isSequentialList(item) && item.targets.at(-1)?.targetId === targetId))
    return [...item.targets.map(target => target.targetId), item.mainTargetId]
  return targetIdsForRating(item, targetId)
}

function ratingForTarget(
  active: ActiveLearningReview,
  target: LearningReviewItem['targets'][number],
  rating: ReviewRating,
): ReviewRating {
  return isBatchSet(active.item)
    && rating !== 'again'
    && target.itemBlockId !== null
    && active.forgottenItemBlockIds.has(target.itemBlockId)
    ? 'again'
    : rating
}

function preparationToken(prepared: PreparedLearningReview) {
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
  prepared: ReadonlyMap<string, PreparedLearningReview>,
  targetId: string,
): PreparedLearningReview {
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
    item: LearningReviewItem,
    options: ActivateLearningReviewOptions = {},
  ): ActiveLearningReview => {
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
      revealed: options.revealed === true || item.card.kind === 'highlight',
      shownAt: now(),
      sourceVisible: false,
      status: 'active',
      targetId,
    }
  }

  const preparation = (active: ActiveLearningReview, revision: number): ReviewPreparationRequest | null => {
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

  const project = (active: ActiveLearningReview): LearningReviewProjection => {
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
    active: ActiveLearningReview,
    prepared: ReadonlyMap<string, PreparedLearningReview>,
    rating: ReviewRating,
  ): { maximum: number, minimum: number } => {
    const intervals = targetIdsForRating(active.item, active.targetId).map((targetId) => {
      const preparedReview = requirePreparation(prepared, targetId)
      const target = active.item.targets.find(candidate => candidate.targetId === targetId)
      if (!target)
        throw new Error(`Review Target ${targetId} is missing from the active Card`)
      return preparedReview.outcomes[ratingForTarget(active, target, rating)].intervalMilliseconds
    })
    return { maximum: Math.max(...intervals), minimum: Math.min(...intervals) }
  }

  const rate = async (
    active: ActiveLearningReview,
    rating: ReviewRating,
    prepared: ReadonlyMap<string, PreparedLearningReview>,
  ): Promise<LearningReviewRatingDecision> => {
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
    const preparedReview = requirePreparation(prepared, active.targetId)
    const result = await adapter.rateTarget({
      ...preparationToken(preparedReview),
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

  const toggleForgotten = (active: ActiveLearningReview, itemBlockId: string): ActiveLearningReview => {
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

  const undo = async (commands: readonly UndoLearningReviewCommand[]): Promise<void> => {
    if (commands.length > 0)
      await adapter.undoMany({ reviews: commands })
  }

  return { activate, preparation, project, rate, ratingIntervals, toggleForgotten, undo }
}
