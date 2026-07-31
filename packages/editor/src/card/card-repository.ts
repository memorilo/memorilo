import type { NodeJSON } from 'prosekit/core'
import type { EditorCardProjection } from './card-model'

export interface EditorCardRecord {
  card: EditorCardProjection
  noteId: string
  topicId: string
}

export interface ReplaceTopicCardsInput {
  cards: readonly EditorCardProjection[]
  noteId: string
  topicId: string
}

export interface EditorCardRepository {
  getCard: (input: { cardId: string }) => Promise<EditorCardRecord | undefined>
  replaceTopicCards: (input: ReplaceTopicCardsInput) => Promise<void>
  searchCards: (input: EditorCardSearchInput) => Promise<readonly EditorCardRecord[]>
}

export interface EditorCardSearchInput {
  limit?: number
  noteId?: string
  query: string
  topicId?: string
}

function topicKey(noteId: string, topicId: string): string {
  return `${noteId}\u0000${topicId}`
}

function cloneRecord(record: EditorCardRecord): EditorCardRecord {
  return structuredClone(record)
}

function appendNodeText(node: NodeJSON, output: string[]): void {
  if (node.text !== undefined)
    output.push(node.text)
  node.content?.forEach(child => appendNodeText(child, output))
}

function cardSearchText(card: EditorCardProjection): string {
  const output: string[] = []
  if (card.kind === 'basic') {
    card.front.forEach(node => appendNodeText(node, output))
    card.back.forEach(node => appendNodeText(node, output))
  }
  else if (card.kind === 'cloze') {
    card.content.forEach(node => appendNodeText(node, output))
  }
  else {
    card.prompt.forEach(node => appendNodeText(node, output))
    card.items.forEach(item => item.content.forEach(node => appendNodeText(node, output)))
  }
  return output.join(' ').toLocaleLowerCase()
}

export function createMemoryEditorCardRepository(): EditorCardRepository {
  const recordsByCardId = new Map<string, EditorCardRecord>()
  const cardIdsByTopic = new Map<string, Set<string>>()

  return {
    getCard: async ({ cardId }) => {
      const record = recordsByCardId.get(cardId)
      return record ? cloneRecord(record) : undefined
    },
    replaceTopicCards: async ({ cards, noteId, topicId }) => {
      const key = topicKey(noteId, topicId)
      const nextIds = new Set<string>()
      for (const card of cards) {
        if (nextIds.has(card.id))
          throw new Error(`Topic ${topicId} projects duplicate CardID ${card.id}`)
        const existing = recordsByCardId.get(card.id)
        if (existing && topicKey(existing.noteId, existing.topicId) !== key)
          throw new Error(`CardID ${card.id} already belongs to Topic ${existing.topicId}`)
        nextIds.add(card.id)
      }

      const previousIds = cardIdsByTopic.get(key)
      previousIds?.forEach(cardId => recordsByCardId.delete(cardId))

      for (const card of cards) {
        recordsByCardId.set(card.id, cloneRecord({ card, noteId, topicId }))
      }
      cardIdsByTopic.set(key, nextIds)
    },
    searchCards: async ({ limit, noteId, query, topicId }) => {
      const normalizedQuery = query.trim().toLocaleLowerCase()
      if (normalizedQuery.length === 0)
        throw new TypeError('Card search query must not be empty')
      if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0))
        throw new TypeError('Card search limit must be a positive integer')

      const results: EditorCardRecord[] = []
      for (const record of recordsByCardId.values()) {
        if (noteId !== undefined && record.noteId !== noteId)
          continue
        if (topicId !== undefined && record.topicId !== topicId)
          continue
        if (!cardSearchText(record.card).includes(normalizedQuery))
          continue
        results.push(cloneRecord(record))
        if (limit !== undefined && results.length === limit)
          break
      }
      return results
    },
  }
}
