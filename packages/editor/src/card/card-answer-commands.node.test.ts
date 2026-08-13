import type { NodeSpec } from 'prosekit/pm/model'
import type { Transaction } from 'prosekit/pm/state'
import { Schema } from 'prosekit/pm/model'
import { EditorState, TextSelection } from 'prosekit/pm/state'
import { describe, expect, it } from 'vitest'
import {
  removeBlockFromCardBackCommand,
  setCardPresentationCommand,
} from './card-answer-membership-commands'

const nodes: Record<string, NodeSpec> = {
  cardDelimiter: {
    atom: true,
    attrs: {
      backwardCardId: { default: null },
      definitionId: {},
      direction: {},
      forwardCardId: { default: null },
    },
    group: 'inline',
    inline: true,
  },
  doc: { content: 'block+' },
  list: {
    attrs: {
      blockHighlight: { default: null },
      blockId: { default: null },
      cardItemDefinitionId: { default: null },
      checked: { default: false },
      collapsed: { default: false },
      kind: { default: 'bullet' },
      order: { default: null },
    },
    content: 'block+',
    group: 'block',
  },
  paragraph: { content: 'inline*', group: 'block' },
  text: { group: 'inline' },
}

const schema = new Schema({ nodes })

function sourceList(content: readonly unknown[]) {
  return {
    attrs: { blockId: 'source', kind: 'bullet' },
    content,
    type: 'list',
  }
}

function delimiter() {
  return {
    attrs: {
      backwardCardId: null,
      definitionId: 'definition',
      direction: 'forward',
      forwardCardId: 'forward-card',
    },
    type: 'cardDelimiter',
  }
}

function member(kind: 'bullet' | 'ordered' = 'bullet') {
  return {
    attrs: {
      blockId: 'answer',
      cardItemDefinitionId: 'definition',
      kind,
    },
    content: [{ content: [{ text: 'Answer', type: 'text' }], type: 'paragraph' }],
    type: 'list',
  }
}

function createState(content: readonly unknown[]): EditorState {
  const doc = schema.nodeFromJSON({ content, type: 'doc' })
  return EditorState.create({
    doc,
    schema,
    selection: TextSelection.atEnd(doc),
  })
}

function execute(state: EditorState, command: ReturnType<typeof setCardPresentationCommand>): EditorState {
  let nextState = state
  expect(command(state, (transaction: Transaction) => {
    nextState = nextState.apply(transaction)
  })).toBe(true)
  return nextState
}

describe('card answer commands', () => {
  it('moves trailing source content into the first answer member', () => {
    const state = createState([sourceList([{
      content: [
        { text: 'Question', type: 'text' },
        delimiter(),
        { text: 'Answer', type: 'text' },
      ],
      type: 'paragraph',
    }])])

    const nextState = execute(state, setCardPresentationCommand('set'))

    expect(nextState.doc.toJSON()).toMatchObject({
      content: [{
        content: [
          {
            content: [
              { text: 'Question', type: 'text' },
              { attrs: { definitionId: 'definition' }, type: 'cardDelimiter' },
            ],
            type: 'paragraph',
          },
          {
            attrs: { cardItemDefinitionId: 'definition', kind: 'bullet' },
            content: [{ content: [{ text: 'Answer', type: 'text' }], type: 'paragraph' }],
            type: 'list',
          },
        ],
        type: 'list',
      }],
      type: 'doc',
    })
  })

  it('changes every existing member to the requested presentation', () => {
    const state = createState([sourceList([
      { content: [{ text: 'Question', type: 'text' }, delimiter()], type: 'paragraph' },
      member('bullet'),
    ])])

    const nextState = execute(state, setCardPresentationCommand('list'))

    expect(nextState.doc.toJSON().content?.[0]?.content?.[1]?.attrs).toMatchObject({
      cardItemDefinitionId: 'definition',
      kind: 'ordered',
      order: null,
    })
  })

  it('removes answer membership without changing the block content', () => {
    const state = createState([sourceList([
      { content: [{ text: 'Question', type: 'text' }, delimiter()], type: 'paragraph' },
      member(),
    ])])
    let nextState = state

    expect(removeBlockFromCardBackCommand()(state, (transaction) => {
      nextState = nextState.apply(transaction)
    })).toBe(true)

    expect(nextState.doc.toJSON().content?.[0]?.content?.[1]).toMatchObject({
      attrs: { cardItemDefinitionId: null },
      content: [{ content: [{ text: 'Answer', type: 'text' }], type: 'paragraph' }],
      type: 'list',
    })
  })
})
