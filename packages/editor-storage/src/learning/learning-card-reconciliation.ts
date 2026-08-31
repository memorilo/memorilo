import type { DatabaseCommand, EditorStorageDatabase } from '../database-driver'
import type { EffectiveLearningOptimizer } from './learning-optimizer-catalog'
import type { LearningCardProjection, LearningTopicCardProjection } from './types'
import { emptyLearningState } from '@memorilo/srs'
import { and, asc, eq } from 'drizzle-orm'
import { v5 as createUuidV5 } from 'uuid'
import { learningCards, learningTargets } from '../drizzle-schema'
import { assertNonEmpty, stateCommand, syncMutationCommand } from './learning-storage-shared'

const targetNamespace = '8a276bb8-9a21-4fe0-a7fe-52af36fd6839'

interface ExistingCardRow {
  active: number
  card_id: string
  direction: 'backward' | 'forward'
  kind: 'basic' | 'cloze' | 'list' | 'set'
  source_block_id: string
  source_order: number
  topic_order: number
}

interface ExistingTargetRow {
  active: number
  item_block_id: string | null
  target_id: string
  target_kind: 'item' | 'whole'
  target_order: number
}

interface LearningCardReconciliationDependencies {
  database: EditorStorageDatabase
  effectiveOptimizer: (noteId: string) => Promise<EffectiveLearningOptimizer>
}

export interface LearningCardReconciliationInput {
  noteId: string
  replaceMissingTopics?: boolean
  topics: readonly LearningTopicCardProjection[]
}

export type LearningCardReconciliationPlanner = (
  input: LearningCardReconciliationInput,
) => Promise<readonly DatabaseCommand[]>

function targetId(cardId: string, itemBlockId: string | null): string {
  return createUuidV5(itemBlockId === null ? `whole:${cardId}` : `item:${cardId}:${itemBlockId}`, targetNamespace)
}

function targetProjection(card: LearningCardProjection): readonly {
  itemBlockId: string | null
  kind: 'item' | 'whole'
  targetId: string
  targetOrder: number
}[] {
  const usesItemTargets = (card.kind === 'list' || card.kind === 'set') && card.direction === 'forward'
  if (!usesItemTargets)
    return [{ itemBlockId: null, kind: 'whole', targetId: targetId(card.cardId, null), targetOrder: 0 }]
  if (card.itemBlockIds.length === 0)
    throw new TypeError(`Forward List/Set Card ${card.cardId} must contain at least one item`)
  const seen = new Set<string>()
  const items = card.itemBlockIds.map((itemBlockId, targetOrder) => {
    assertNonEmpty(itemBlockId, 'Card item Block id')
    if (seen.has(itemBlockId))
      throw new Error(`Card ${card.cardId} contains duplicate item Block ${itemBlockId}`)
    seen.add(itemBlockId)
    return { itemBlockId, kind: 'item' as const, targetId: targetId(card.cardId, itemBlockId), targetOrder: targetOrder + 1 }
  })
  return [
    { itemBlockId: null, kind: 'whole', targetId: targetId(card.cardId, null), targetOrder: 0 },
    ...items,
  ]
}

function validateTopics(topics: readonly LearningTopicCardProjection[]): Map<string, LearningCardProjection> {
  const topicIds = new Set<string>()
  const projectedCards = new Map<string, LearningCardProjection>()
  for (const topic of topics) {
    assertNonEmpty(topic.topicId, 'Topic id')
    if (!Number.isSafeInteger(topic.topicOrder) || topic.topicOrder < 0)
      throw new RangeError('Topic order must be a non-negative safe integer')
    if (topicIds.has(topic.topicId))
      throw new Error(`Learning projection contains duplicate Topic ${topic.topicId}`)
    topicIds.add(topic.topicId)
    for (const card of topic.cards) {
      assertNonEmpty(card.cardId, 'CardID')
      assertNonEmpty(card.sourceBlockId, 'Source Block id')
      if (projectedCards.has(card.cardId))
        throw new Error(`Learning projection contains duplicate CardID ${card.cardId}`)
      if (!['basic', 'cloze', 'list', 'set'].includes(card.kind))
        throw new TypeError(`Unsupported learning Card kind: ${String(card.kind)}`)
      if (card.direction !== 'forward' && card.direction !== 'backward')
        throw new TypeError(`Unsupported learning Card direction: ${String(card.direction)}`)
      targetProjection(card)
      projectedCards.set(card.cardId, card)
    }
  }
  return projectedCards
}

async function completeTopics(
  database: EditorStorageDatabase,
  noteId: string,
  topics: readonly LearningTopicCardProjection[],
  replaceMissingTopics: boolean,
): Promise<readonly LearningTopicCardProjection[]> {
  if (!replaceMissingTopics)
    return topics
  const projectedTopicIds = new Set(topics.map(topic => topic.topicId))
  const existing = database.drizzle.selectDistinct({ topic_id: learningCards.topicId })
    .from(learningCards)
    .where(eq(learningCards.noteId, noteId))
    .orderBy(asc(learningCards.topicId))
    .all() as Array<{ topic_id: string }>
  return [
    ...topics,
    ...existing
      .filter(row => !projectedTopicIds.has(row.topic_id))
      .map(row => ({ cards: [], topicId: row.topic_id, topicOrder: 0 })),
  ]
}

export async function planLearningCardReconciliation(
  dependencies: LearningCardReconciliationDependencies,
  input: LearningCardReconciliationInput,
): Promise<readonly DatabaseCommand[]> {
  assertNonEmpty(input.noteId, 'Note id')
  const topics = structuredClone(await completeTopics(
    dependencies.database,
    input.noteId,
    input.topics,
    input.replaceMissingTopics === true,
  ))
  const projectedCards = validateTopics(topics)
  const optimizer = projectedCards.size === 0
    ? null
    : await dependencies.effectiveOptimizer(input.noteId)

  for (const cardId of projectedCards.keys()) {
    const owner = dependencies.database.drizzle.select({ note_id: learningCards.noteId })
      .from(learningCards)
      .where(eq(learningCards.cardId, cardId))
      .get() as { note_id: string } | undefined
    if (owner && owner.note_id !== input.noteId)
      throw new Error(`CardID ${cardId} already belongs to Note ${owner.note_id}`)
  }

  const commands: DatabaseCommand[] = []
  const now = Date.now()
  for (const topic of topics) {
    const existingCards = dependencies.database.drizzle.select({
      card_id: learningCards.cardId,
      topic_id: learningCards.topicId,
      topic_order: learningCards.topicOrder,
      source_block_id: learningCards.sourceBlockId,
      source_order: learningCards.sourceOrder,
      kind: learningCards.kind,
      direction: learningCards.direction,
      active: learningCards.active,
    }).from(learningCards).where(and(eq(learningCards.noteId, input.noteId), eq(learningCards.topicId, topic.topicId))).all() as ExistingCardRow[]
    const existingById = new Map(existingCards.map(row => [row.card_id, row]))
    const topicCardIds = new Set(topic.cards.map(card => card.cardId))
    for (const existing of existingCards) {
      if (!topicCardIds.has(existing.card_id)
        && !projectedCards.has(existing.card_id)
        && existing.active === 1) {
        commands.push(
          {
            drizzle: database => database.update(learningCards).set({
              active: 0,
              inactiveAt: now,
              syncSequence: -1,
            }).where(eq(learningCards.cardId, existing.card_id)).run(),
          },
          {
            drizzle: database => database.update(learningTargets).set({
              active: 0,
              inactiveAt: now,
            }).where(eq(learningTargets.cardId, existing.card_id)).run(),
          },
          syncMutationCommand('card', existing.card_id, 'upsert', { active: false }, now),
        )
      }
    }

    for (const [sourceOrder, card] of topic.cards.entries()) {
      const projectedTargets = targetProjection(card)
      const projectedTargetIds = new Set(projectedTargets.map(target => target.targetId))
      const storedTargets = dependencies.database.drizzle.select({
        target_id: learningTargets.targetId,
        target_kind: learningTargets.targetKind,
        item_block_id: learningTargets.itemBlockId,
        target_order: learningTargets.targetOrder,
        active: learningTargets.active,
      }).from(learningTargets).where(eq(learningTargets.cardId, card.cardId)).all() as ExistingTargetRow[]
      const storedTargetById = new Map(storedTargets.map(target => [target.target_id, target]))
      const existing = existingById.get(card.cardId)
      const cardChanged = existing === undefined
        || existing.active !== 1
        || existing.topic_order !== topic.topicOrder
        || existing.source_block_id !== card.sourceBlockId
        || existing.source_order !== sourceOrder
        || existing.kind !== card.kind
        || existing.direction !== card.direction
      const targetsChanged = projectedTargets.some((target) => {
        const stored = storedTargetById.get(target.targetId)
        return stored === undefined
          || stored.active !== 1
          || stored.target_kind !== target.kind
          || stored.item_block_id !== target.itemBlockId
          || stored.target_order !== target.targetOrder
      }) || storedTargets.some(target => target.active === 1 && !projectedTargetIds.has(target.target_id))
      if (!cardChanged && !targetsChanged)
        continue
      commands.push({
        drizzle: database => database.insert(learningCards).values({
          active: 1,
          cardId: card.cardId,
          direction: card.direction,
          firstSeenAt: now,
          inactiveAt: null,
          kind: card.kind,
          lastSeenAt: now,
          noteId: input.noteId,
          sourceBlockId: card.sourceBlockId,
          sourceOrder,
          topicId: topic.topicId,
          topicOrder: topic.topicOrder,
        }).onConflictDoUpdate({
          set: {
            active: 1,
            direction: card.direction,
            inactiveAt: null,
            kind: card.kind,
            lastSeenAt: now,
            noteId: input.noteId,
            sourceBlockId: card.sourceBlockId,
            sourceOrder,
            syncSequence: -1,
            topicId: topic.topicId,
            topicOrder: topic.topicOrder,
          },
          target: learningCards.cardId,
        }).run(),
      })
      for (const storedTarget of storedTargets) {
        if (!projectedTargetIds.has(storedTarget.target_id)) {
          commands.push({
            drizzle: database => database.update(learningTargets).set({
              active: 0,
              inactiveAt: now,
            }).where(eq(learningTargets.targetId, storedTarget.target_id)).run(),
          })
        }
      }
      for (const target of projectedTargets) {
        commands.push({
          drizzle: database => database.insert(learningTargets).values({
            active: 1,
            cardId: card.cardId,
            createdAt: now,
            inactiveAt: null,
            itemBlockId: target.itemBlockId,
            targetId: target.targetId,
            targetKind: target.kind,
            targetOrder: target.targetOrder,
          }).onConflictDoUpdate({
            set: { active: 1, inactiveAt: null, targetOrder: target.targetOrder },
            target: learningTargets.targetId,
          }).run(),
        })
        if (!optimizer)
          throw new Error(`Note ${input.noteId} has no effective FSRS Optimizer`)
        commands.push(stateCommand(emptyLearningState(
          target.targetId,
          now,
          optimizer.revisionId,
        ), 'ignore'))
      }
      commands.push(syncMutationCommand('card', card.cardId, 'upsert', {
        active: true,
        cardId: card.cardId,
        direction: card.direction,
        itemBlockIds: card.itemBlockIds,
        kind: card.kind,
        noteId: input.noteId,
        sourceBlockId: card.sourceBlockId,
        sourceOrder,
        topicOrder: topic.topicOrder,
        topicId: topic.topicId,
      }, now))
    }
  }
  return commands
}
