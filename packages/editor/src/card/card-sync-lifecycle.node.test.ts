import type { NodeJSON } from 'prosekit/core'
import type { EditorCardRepository } from './card-repository'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'

import { createEditorCardSync, EditorCardSyncClosedError } from './card-sync'

function document(text: string): NodeJSON {
  return {
    type: 'doc',
    content: [{
      type: 'list',
      attrs: { blockHighlight: null, blockHighlightId: null, blockId: `block-${text}` },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    }],
  }
}

function createRepository(replaceTopicCards: EditorCardRepository['replaceTopicCards']): EditorCardRepository {
  return {
    getCard: async () => undefined,
    replaceTopicCards,
    searchCards: async () => [],
  }
}

describe('editor Card sync lifecycle', () => {
  it('serializes replacements and drains accepted work during close', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    const replaceTopicCards = vi.fn<EditorCardRepository['replaceTopicCards']>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const sync = createEditorCardSync({
      noteId: 'note',
      onSyncError: vi.fn(),
      repository: createRepository(replaceTopicCards),
      topicId: 'topic',
    })

    const firstSchedule = sync.schedule(document('first'))
    const secondSchedule = sync.schedule(document('second'))
    await vi.waitFor(() => expect(replaceTopicCards).toHaveBeenCalledTimes(1))
    const close = sync.close()
    const flushDuringClose = sync.flush()

    first.resolve()
    await firstSchedule
    await vi.waitFor(() => expect(replaceTopicCards).toHaveBeenCalledTimes(2))
    second.resolve()
    await Promise.all([secondSchedule, close, flushDuringClose])
  })

  it('rejects schedule after close without projecting into the repository', async () => {
    const replaceTopicCards = vi.fn<EditorCardRepository['replaceTopicCards']>(async () => {})
    const sync = createEditorCardSync({
      noteId: 'note',
      onSyncError: vi.fn(),
      repository: createRepository(replaceTopicCards),
      topicId: 'topic',
    })
    await sync.close()

    await expect(sync.schedule(document('closed'))).rejects.toBeInstanceOf(EditorCardSyncClosedError)
    expect(replaceTopicCards).not.toHaveBeenCalled()
  })

  it('keeps the queue usable after repository failure', async () => {
    const error = new Error('storage unavailable')
    const onSyncError = vi.fn()
    const replaceTopicCards = vi.fn<EditorCardRepository['replaceTopicCards']>()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined)
    const sync = createEditorCardSync({
      noteId: 'note',
      onSyncError,
      repository: createRepository(replaceTopicCards),
      topicId: 'topic',
    })

    await sync.schedule(document('first'))
    await sync.schedule(document('second'))

    expect(replaceTopicCards).toHaveBeenCalledTimes(2)
    expect(onSyncError).toHaveBeenCalledWith({
      error,
      noteId: 'note',
      phase: 'repository',
      topicId: 'topic',
    })
    await sync.close()
  })

  it('isolates failures in the integration error listener', async () => {
    const repositoryError = new Error('storage unavailable')
    const listenerError = new Error('listener failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sync = createEditorCardSync({
      noteId: 'note',
      onSyncError: () => {
        throw listenerError
      },
      repository: createRepository(async () => {
        throw repositoryError
      }),
      topicId: 'topic',
    })

    await expect(sync.schedule(document('content'))).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalledWith('Editor Card sync error listener failed', listenerError)
    await sync.close()
    consoleError.mockRestore()
  })
})
