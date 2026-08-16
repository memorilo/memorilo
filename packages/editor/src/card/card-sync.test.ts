import type { NodeJSON } from 'prosekit/core'
import type { EditorCardRepository } from './card-repository'
import { describe, expect, it, vi } from 'vitest'

import { createEditorCardSync } from './card-sync'

function document(text: string): NodeJSON {
  return {
    type: 'doc',
    content: [{
      type: 'list',
      attrs: {
        blockHighlight: null,
        blockHighlightId: null,
        blockId: `block-${text}`,
      },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    }],
  }
}

describe('editor Card projection sync', () => {
  it('serializes Topic replacements in document-change order', async () => {
    const replaced: string[] = []
    const repository: EditorCardRepository = {
      getCard: async () => undefined,
      replaceTopicCards: async ({ topicId }) => {
        await Promise.resolve()
        replaced.push(topicId)
      },
      searchCards: async () => [],
    }
    const sync = createEditorCardSync({
      noteId: 'note-one',
      onSyncError: vi.fn(),
      repository,
      topicId: 'topic-one',
    })

    sync.schedule(document('first'))
    sync.schedule(document('second'))
    await sync.flush()

    expect(replaced).toEqual(['topic-one', 'topic-one'])
  })

  it('reports repository failures through the required integration error callback', async () => {
    const error = new Error('Card storage unavailable')
    const onSyncError = vi.fn()
    const repository: EditorCardRepository = {
      getCard: async () => undefined,
      replaceTopicCards: async () => {
        throw error
      },
      searchCards: async () => [],
    }
    const sync = createEditorCardSync({
      noteId: 'note-one',
      onSyncError,
      repository,
      topicId: 'topic-one',
    })

    sync.schedule(document('content'))
    await sync.flush()

    expect(onSyncError).toHaveBeenCalledTimes(1)
    expect(onSyncError).toHaveBeenCalledWith({
      error,
      noteId: 'note-one',
      phase: 'repository',
      topicId: 'topic-one',
    })
  })

  it('reports projection contract failures without calling the repository', async () => {
    const onSyncError = vi.fn()
    const replaceTopicCards = vi.fn<EditorCardRepository['replaceTopicCards']>(async () => {})
    const sync = createEditorCardSync({
      noteId: 'note-one',
      onSyncError,
      repository: {
        getCard: async () => undefined,
        replaceTopicCards,
        searchCards: async () => [],
      },
      topicId: 'topic-one',
    })

    sync.schedule({ type: 'paragraph' })
    await sync.flush()

    expect(replaceTopicCards).not.toHaveBeenCalled()
    expect(onSyncError).toHaveBeenCalledTimes(1)
    expect(onSyncError.mock.calls[0]?.[0]).toMatchObject({
      noteId: 'note-one',
      phase: 'projection',
      topicId: 'topic-one',
    })
    expect(onSyncError.mock.calls[0]?.[0].error).toEqual(new TypeError('Expected a doc node, received paragraph'))
  })
})
