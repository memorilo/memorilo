import type {
  DesktopReviewItem,
  GetNextDesktopReviewItemInput,
  RestoreDesktopReviewItemInput,
} from '@memorilo/desktop-api'
import type { LearningQueueItem, LearningStorage, LearningTarget } from '@memorilo/editor-storage'
import type { ReviewCardProjection } from '@memorilo/editor/card'
import type { NoteApplicationService, NoteCardProjection } from '../notes/note-application-service'
import { NoteCardProjectionNotFoundError } from '../notes/note-application-service'

class ReviewQueueItemUnavailableError extends Error {
  override readonly name = 'ReviewQueueItemUnavailableError'
}

function unavailable(queue: LearningQueueItem, reason: string): ReviewQueueItemUnavailableError {
  return new ReviewQueueItemUnavailableError(`Review Card ${queue.cardId} is unavailable: ${reason}`)
}

function queueItemIdentity(queue: LearningQueueItem): string {
  return JSON.stringify([
    queue.noteId,
    queue.topicId,
    queue.cardId,
    queue.presentation,
    queue.targetIds,
  ])
}

function queueItemFingerprint(queue: LearningQueueItem): string {
  return JSON.stringify([
    queueItemIdentity(queue),
    queue.dueAt,
    queue.phase,
    queue.sourceBlockId,
  ])
}

function resolveTargets(
  queue: LearningQueueItem,
  card: ReviewCardProjection,
  cardTargets: readonly LearningTarget[],
): Pick<DesktopReviewItem, 'mainTargetId' | 'targets'> {
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
    mainTargetId: mainTarget.targetId,
    targets: targets.map(target => ({
      itemBlockId: target.itemBlockId,
      targetId: target.targetId,
    })),
  }
}

async function resolveQueueItem(
  notes: NoteApplicationService,
  learning: LearningStorage,
  queue: LearningQueueItem,
): Promise<DesktopReviewItem> {
  const projection = await notes.getCardProjection({
    cardId: queue.cardId,
    noteId: queue.noteId,
    topicId: queue.topicId,
  })
  if (projection.card.sourceBlockId !== queue.sourceBlockId)
    throw unavailable(queue, 'its Source Block changed while the Queue was being resolved')
  const resolvedTargets = resolveTargets(queue, projection.card, await learning.cards.listTargets(queue.cardId))
  return reviewItem(projection, queue, resolvedTargets)
}

function reviewItem(
  projection: NoteCardProjection,
  queue: LearningQueueItem,
  resolvedTargets: Pick<DesktopReviewItem, 'mainTargetId' | 'targets'>,
): DesktopReviewItem {
  return {
    card: projection.card,
    mainTargetId: resolvedTargets.mainTargetId,
    noteTitle: projection.noteTitle,
    queue,
    targets: resolvedTargets.targets,
    topicTitle: projection.topicTitle,
    updatedAt: projection.updatedAt,
  }
}

export function createLearningReviewApplication(
  notes: NoteApplicationService,
  learning: LearningStorage,
  now: () => number = Date.now,
) {
  const getNextItem = async (
    input: GetNextDesktopReviewItemInput,
    mode: 'mixed' | 'new' | 'review',
  ): Promise<DesktopReviewItem | null> => {
    const queueInput = { ...input, now: input.now ?? now() }
    const unavailableCandidates = new Set<string>()
    while (true) {
      const [queue] = await learning.queue.list({ ...queueInput, limit: 1, mode })
      if (!queue)
        return null
      const candidateKey = queueItemIdentity(queue)
      try {
        const resolved = await resolveQueueItem(notes, learning, queue)
        const [refreshed] = await learning.queue.list({ ...queueInput, limit: 1, mode })
        if (!refreshed || queueItemFingerprint(refreshed) !== queueItemFingerprint(queue))
          continue
        return resolved
      }
      catch (error) {
        if (!(error instanceof NoteCardProjectionNotFoundError)
          && !(error instanceof ReviewQueueItemUnavailableError)) {
          throw error
        }
        if (unavailableCandidates.has(candidateKey)) {
          throw new Error('The Review Queue did not stabilize after refreshing its Card projection', {
            cause: error,
          })
        }
        unavailableCandidates.add(candidateKey)
      }
    }
  }

  return {
    getNextItem: (
      input: GetNextDesktopReviewItemInput = {},
    ): Promise<DesktopReviewItem | null> => getNextItem(input, 'mixed'),
    getNextNewItem: (
      input: GetNextDesktopReviewItemInput = {},
    ): Promise<DesktopReviewItem | null> => getNextItem(input, 'new'),
    getNextReviewItem: (
      input: GetNextDesktopReviewItemInput = {},
    ): Promise<DesktopReviewItem | null> => getNextItem(input, 'review'),
    restoreReviewItem: async (
      input: RestoreDesktopReviewItemInput,
    ): Promise<DesktopReviewItem | null> => {
      let projection: NoteCardProjection
      try {
        projection = await notes.getCardProjection(input)
      }
      catch (error) {
        if (error instanceof NoteCardProjectionNotFoundError)
          return null
        throw error
      }

      const activeTargets = (await learning.cards.listTargets(input.cardId)).filter(target => target.active)
      const selectedTarget = activeTargets.find(target => target.targetId === input.targetId)
      if (!selectedTarget)
        return null
      const usesItemTargets = (projection.card.kind === 'list' || projection.card.kind === 'set')
        && projection.card.direction === 'forward'
      const targets = input.presentation === 'partial'
        ? [selectedTarget]
        : usesItemTargets ? activeTargets.filter(target => target.kind === 'item') : [selectedTarget]
      const state = await learning.reviews.getState(input.targetId)
      const queue: LearningQueueItem = {
        cardId: input.cardId,
        dueAt: state.dueAt,
        noteId: input.noteId,
        phase: state.phase,
        presentation: input.presentation,
        sourceBlockId: projection.card.sourceBlockId,
        targetIds: targets.map(target => target.targetId),
        topicId: input.topicId,
      }

      try {
        return reviewItem(projection, queue, resolveTargets(queue, projection.card, activeTargets))
      }
      catch (error) {
        if (error instanceof ReviewQueueItemUnavailableError)
          return null
        throw error
      }
    },
  }
}

export type LearningReviewApplication = ReturnType<typeof createLearningReviewApplication>
