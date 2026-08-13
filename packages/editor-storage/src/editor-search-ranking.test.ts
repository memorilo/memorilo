import type { TopicBlockSearchHit, TopicSearchHit } from './editor-storage-contracts'
import { describe, expect, it } from 'vitest'
import { fuseTopicBlockSearchResults, mergeNoteSearchResults } from './editor-search-ranking'

function topicHit(topicId: string, match: TopicSearchHit['match']): TopicSearchHit {
  return {
    blockId: `${topicId}-block`,
    kind: 'topic',
    match,
    noteId: 'note',
    noteTitle: 'Note',
    preview: topicId,
    rank: 0,
    topicId,
    topicTitle: topicId,
  }
}

function blockHit(id: string, preview = id): TopicBlockSearchHit {
  return {
    attributes: {},
    contentHash: `${id}-hash`,
    id,
    kind: 'outline',
    noteId: 'note',
    ordinal: 0,
    parentId: null,
    preview,
    rank: 0,
    text: id,
    topicId: 'topic',
  }
}

describe('editor search ranking', () => {
  it('keeps title and discovery-channel priority while removing duplicate Topics', () => {
    const title = topicHit('title', 'title')
    const nodeStart = topicHit('node-start', 'node-start')
    const content = topicHit('content', 'content')
    const semantic = topicHit('semantic', 'semantic')

    const results = mergeNoteSearchResults(
      [title],
      [nodeStart, title],
      [content, nodeStart],
      [semantic, content],
      4,
    )

    expect(results.map(hit => hit.kind === 'topic' ? hit.topicId : hit.noteId))
      .toEqual(['title', 'node-start', 'content', 'semantic'])
  })

  it('keeps a Topic Block once and rewards matches from both channels', () => {
    const lexicalOnly = blockHit('lexical-only')
    const both = blockHit('both')
    const semanticOnly = blockHit('semantic-only')

    const results = fuseTopicBlockSearchResults(
      [lexicalOnly, both],
      [semanticOnly, both],
      3,
    )

    expect(results.map(hit => hit.id)).toEqual(['both', 'lexical-only', 'semantic-only'])
    expect(new Set(results.map(hit => hit.id)).size).toBe(3)
  })

  it('retains a highlighted preview when deduplicating a hybrid result', () => {
    const result = fuseTopicBlockSearchResults(
      [blockHit('both')],
      [blockHit('both', 'matched <mark>preview</mark>')],
      1,
    )

    expect(result[0]?.preview).toBe('matched <mark>preview</mark>')
  })
})
