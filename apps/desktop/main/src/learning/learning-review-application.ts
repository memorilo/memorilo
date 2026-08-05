import type { DesktopReviewItem, GetNextDesktopReviewItemInput } from '@memorilo/desktop-preload'
import type { LearningQueueItem, LearningStorage, LearningTarget } from '@memorilo/editor-storage'
import type { EditorCardProjection } from '@memorilo/editor/card'
import type { NoteApplicationService } from '../notes/note-application-service'
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
  card: EditorCardProjection,
  cardTargets: readonly LearningTarget[],
): DesktopReviewItem['targets'] {
  const targetById = new Map(cardTargets.map(target => [target.targetId, target]))
  const seen = new Set<string>()
  const targets = queue.targetIds.map((targetId) => {
    if (seen.has(targetId))
      throw unavailable(queue, `the Queue contains duplicate Target ${targetId}`)
    seen.add(targetId)
    const target = targetById.get(targetId)
    if (!target || !target.active || target.cardId !== queue.cardId)
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
  else if (targets.length !== 1 || targets[0]?.kind !== 'whole' || targets[0].itemBlockId !== null) {
    throw unavailable(queue, 'a whole Card presentation requires exactly one whole Target')
  }

  return targets.map(target => ({
    itemBlockId: target.itemBlockId,
    targetId: target.targetId,
  }))
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
  const targets = resolveTargets(queue, projection.card, await learning.listTargets(queue.cardId))
  return {
    card: projection.card,
    noteTitle: projection.noteTitle,
    queue,
    targets,
    topicTitle: projection.topicTitle,
    updatedAt: projection.updatedAt,
  }
}

export function createLearningReviewApplication(
  notes: NoteApplicationService,
  learning: LearningStorage,
) {
  const getNextItem = async (
    input: GetNextDesktopReviewItemInput,
    mode: 'new' | 'review',
  ): Promise<DesktopReviewItem | null> => {
    const unavailableCandidates = new Set<string>()
    while (true) {
      const [queue] = await learning.listQueue({ ...input, limit: 1, mode })
      if (!queue)
        return null
      const candidateKey = queueItemIdentity(queue)
      try {
        const resolved = await resolveQueueItem(notes, learning, queue)
        const [refreshed] = await learning.listQueue({ ...input, limit: 1, mode })
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
    getNextNewItem: (
      input: GetNextDesktopReviewItemInput = {},
    ): Promise<DesktopReviewItem | null> => getNextItem(input, 'new'),
    getNextReviewItem: (
      input: GetNextDesktopReviewItemInput = {},
    ): Promise<DesktopReviewItem | null> => getNextItem(input, 'review'),
  }
}

export type LearningReviewApplication = ReturnType<typeof createLearningReviewApplication>
