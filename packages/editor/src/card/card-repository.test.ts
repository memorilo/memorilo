import type { BasicEditorCardProjection } from './card-model'
import { describe, expect, it } from 'vitest'

import { createMemoryEditorCardRepository } from './card-repository'

const card: BasicEditorCardProjection = {
  back: [{ type: 'paragraph', content: [{ type: 'text', text: 'A language for the web' }] }],
  blockHighlight: null,
  definitionId: 'definition-typescript',
  direction: 'forward',
  front: [{ type: 'paragraph', content: [{ type: 'text', text: 'TypeScript' }] }],
  id: 'card-typescript',
  kind: 'basic',
  sourceBlockId: 'block-typescript',
}

describe('memory Editor Card repository', () => {
  it('stores a Topic projection and retrieves a Card through the repository interface', async () => {
    const repository = createMemoryEditorCardRepository()

    await repository.replaceTopicCards({
      cards: [card],
      noteId: 'note-programming',
      topicId: 'topic-languages',
    })

    expect(await repository.getCard({ cardId: 'card-typescript' })).toEqual({
      card,
      noteId: 'note-programming',
      topicId: 'topic-languages',
    })
  })

  it('searches stored Card content without exposing repository internals', async () => {
    const repository = createMemoryEditorCardRepository()
    await repository.replaceTopicCards({
      cards: [card],
      noteId: 'note-programming',
      topicId: 'topic-languages',
    })

    expect(await repository.searchCards({ query: 'LANGUAGE FOR' })).toEqual([{
      card,
      noteId: 'note-programming',
      topicId: 'topic-languages',
    }])
    expect(await repository.searchCards({ query: 'unrelated' })).toEqual([])
  })

  it('filters cross-Topic search results and applies a positive result limit', async () => {
    const repository = createMemoryEditorCardRepository()
    const secondCard: BasicEditorCardProjection = {
      ...card,
      definitionId: 'definition-javascript',
      front: [{ type: 'paragraph', content: [{ type: 'text', text: 'JavaScript' }] }],
      id: 'card-javascript',
      sourceBlockId: 'block-javascript',
    }
    const thirdCard: BasicEditorCardProjection = {
      ...card,
      definitionId: 'definition-rust',
      front: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rust' }] }],
      id: 'card-rust',
      sourceBlockId: 'block-rust',
    }
    await repository.replaceTopicCards({ cards: [card], noteId: 'note-one', topicId: 'topic-one' })
    await repository.replaceTopicCards({ cards: [secondCard], noteId: 'note-one', topicId: 'topic-two' })
    await repository.replaceTopicCards({ cards: [thirdCard], noteId: 'note-two', topicId: 'topic-three' })

    expect(await repository.searchCards({ noteId: 'note-one', query: 'language' })).toEqual([
      { card, noteId: 'note-one', topicId: 'topic-one' },
      { card: secondCard, noteId: 'note-one', topicId: 'topic-two' },
    ])
    expect(await repository.searchCards({ limit: 1, query: 'language' })).toEqual([
      { card, noteId: 'note-one', topicId: 'topic-one' },
    ])
    expect(await repository.searchCards({ query: 'language', topicId: 'topic-three' })).toEqual([
      { card: thirdCard, noteId: 'note-two', topicId: 'topic-three' },
    ])
  })
})
