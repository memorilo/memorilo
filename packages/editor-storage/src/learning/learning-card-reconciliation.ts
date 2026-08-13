import type { DatabaseCommand, EditorStorageDatabase } from '../database-driver'
import type { EffectiveLearningOptimizer } from './learning-optimizer-catalog'
import type { LearningCardProjection, LearningTopicCardProjection } from './types'
import { emptyLearningState } from '@memorilo/srs'
import { v5 as createUuidV5 } from 'uuid'
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
  const existing = await database.all<{ topic_id: string }>(
    'SELECT DISTINCT topic_id FROM learning_cards WHERE note_id = ? ORDER BY topic_id',
    [noteId],
  )
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
    const owner = await dependencies.database.get<{ note_id: string }>(
      'SELECT note_id FROM learning_cards WHERE card_id = ?',
      [cardId],
    )
    if (owner && owner.note_id !== input.noteId)
      throw new Error(`CardID ${cardId} already belongs to Note ${owner.note_id}`)
  }

  const commands: DatabaseCommand[] = []
  const now = Date.now()
  for (const topic of topics) {
    const existingCards = await dependencies.database.all<ExistingCardRow>(
      'SELECT card_id, topic_order, source_block_id, source_order, kind, direction, active FROM learning_cards WHERE note_id = ? AND topic_id = ?',
      [input.noteId, topic.topicId],
    )
    const existingById = new Map(existingCards.map(row => [row.card_id, row]))
    const topicCardIds = new Set(topic.cards.map(card => card.cardId))
    for (const existing of existingCards) {
      if (!topicCardIds.has(existing.card_id)
        && !projectedCards.has(existing.card_id)
        && existing.active === 1) {
        commands.push(
          {
            parameters: [now, existing.card_id],
            sql: 'UPDATE learning_cards SET active = 0, inactive_at = ?, sync_sequence = -1 WHERE card_id = ?',
          },
          {
            parameters: [now, existing.card_id],
            sql: 'UPDATE learning_targets SET active = 0, inactive_at = ? WHERE card_id = ?',
          },
          syncMutationCommand('card', existing.card_id, 'upsert', { active: false }, now),
        )
      }
    }

    for (const [sourceOrder, card] of topic.cards.entries()) {
      const projectedTargets = targetProjection(card)
      const projectedTargetIds = new Set(projectedTargets.map(target => target.targetId))
      const storedTargets = await dependencies.database.all<ExistingTargetRow>(
        'SELECT target_id, target_kind, item_block_id, target_order, active FROM learning_targets WHERE card_id = ?',
        [card.cardId],
      )
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
        parameters: [
          card.cardId,
          input.noteId,
          topic.topicId,
          topic.topicOrder,
          card.sourceBlockId,
          sourceOrder,
          card.kind,
          card.direction,
          now,
          now,
        ],
        sql: 'INSERT INTO learning_cards (card_id, note_id, topic_id, topic_order, source_block_id, source_order, kind, direction, active, first_seen_at, last_seen_at, inactive_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL) ON CONFLICT(card_id) DO UPDATE SET note_id = excluded.note_id, topic_id = excluded.topic_id, topic_order = excluded.topic_order, source_block_id = excluded.source_block_id, source_order = excluded.source_order, kind = excluded.kind, direction = excluded.direction, active = 1, last_seen_at = excluded.last_seen_at, inactive_at = NULL, sync_sequence = -1',
      })
      for (const storedTarget of storedTargets) {
        if (!projectedTargetIds.has(storedTarget.target_id)) {
          commands.push({
            parameters: [now, storedTarget.target_id],
            sql: 'UPDATE learning_targets SET active = 0, inactive_at = ? WHERE target_id = ?',
          })
        }
      }
      for (const target of projectedTargets) {
        commands.push({
          parameters: [
            target.targetId,
            card.cardId,
            target.kind,
            target.itemBlockId,
            target.targetOrder,
            now,
          ],
          sql: 'INSERT INTO learning_targets (target_id, card_id, target_kind, item_block_id, target_order, active, created_at, inactive_at) VALUES (?, ?, ?, ?, ?, 1, ?, NULL) ON CONFLICT(target_id) DO UPDATE SET target_order = excluded.target_order, active = 1, inactive_at = NULL',
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
