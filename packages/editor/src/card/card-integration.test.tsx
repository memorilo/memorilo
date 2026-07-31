import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EditorMode } from '../common/editor-mode'
import { Editor } from '../editor'
import { createEditorNote } from '../note/editor-note'
import { createMemoryEditorCardRepository } from './card-repository'

const adapters: EditorAdapters = {
  uploadImage: async () => 'memory://image',
  tagStorage: {
    create: async tag => tag,
    search: async () => [],
    update: async tag => tag,
  },
}

function cardDocument(): NodeJSON {
  return {
    type: 'doc',
    content: [{
      type: 'list',
      attrs: {
        blockId: 'block-typescript',
        checked: false,
        collapsed: false,
        kind: 'outline',
        order: null,
      },
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'TypeScript' },
          {
            type: 'cardDelimiter',
            attrs: {
              backwardCardId: null,
              definitionId: 'definition-typescript',
              direction: 'forward',
              forwardCardId: 'card-typescript',
            },
          },
          {
            type: 'text',
            marks: [{ type: 'inlineHighlight', attrs: { color: 'yellow' } }],
            text: 'A typed language for the web',
          },
        ],
      }],
    }, {
      type: 'list',
      attrs: {
        blockId: 'block-cloze',
        checked: false,
        collapsed: false,
        kind: 'outline',
        order: null,
      },
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{
            type: 'cloze',
            attrs: {
              anchorKind: 'rich-content',
              cardId: 'card-cloze',
              definitionId: 'definition-cloze',
              groupId: 'group-cloze',
            },
          }],
          text: 'Hidden fact',
        }],
      }],
    }],
  }
}

describe('editor Card integration', () => {
  it('projects the initial Topic into an injected repository without Desktop services', async () => {
    const repository = createMemoryEditorCardRepository()
    const onSyncError = vi.fn()
    const note = createEditorNote({ id: 'note-cards' })
    const topicId = note.createTopic({
      initialContent: cardDocument(),
      mode: EditorMode.Document,
      title: 'Cards',
    })

    render(
      <Editor
        adapters={adapters}
        cards={{ onSyncError, repository }}
        topic={note.getTopic(topicId)}
      />,
    )

    await waitFor(async () => {
      const record = await repository.getCard({ cardId: 'card-typescript' })
      expect(record?.noteId).toBe('note-cards')
      expect(record?.topicId).toBe(topicId)
      expect(record?.card).toMatchObject({
        blockHighlight: null,
        direction: 'forward',
        id: 'card-typescript',
        kind: 'basic',
      })
    })
    await waitFor(async () => {
      const record = await repository.getCard({ cardId: 'card-cloze' })
      expect(record?.card).toMatchObject({
        clozeGroupId: 'group-cloze',
        id: 'card-cloze',
        kind: 'cloze',
      })
    })
    expect(onSyncError).not.toHaveBeenCalled()
  })
})
