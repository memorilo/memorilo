import { defineBasicExtension } from 'prosekit/basic'
import { union } from 'prosekit/core'
import { createTestEditor } from 'prosekit/core/test'
import { defineMathBlockSpec, defineMathInlineSpec } from 'prosekit/extensions/math'
import { TextSelection } from 'prosekit/pm/state'
import { afterEach, describe, expect, it } from 'vitest'

import { defineCardExtension } from './card-extension'

const mountedEditors: VoidFunction[] = []

function setup(ids: readonly string[]) {
  let index = 0
  const createId = () => {
    const id = ids[index]
    if (!id)
      throw new Error(`Missing deterministic Card test ID at index ${index}`)
    index += 1
    return id
  }
  const extension = union(defineBasicExtension(), defineCardExtension({ createId }))
  const editor = createTestEditor({ extension })
  const element = document.body.appendChild(document.createElement('div'))
  editor.mount(element)
  mountedEditors.push(() => {
    editor.unmount()
    element.remove()
  })
  return editor
}

function inputText(editor: ReturnType<typeof setup>, text: string) {
  for (const character of text) {
    const { from, to } = editor.view.state.selection
    let handled = false
    editor.view.someProp('handleTextInput', (handler) => {
      const transaction = editor.view.state.tr.insertText(character, from, to)
      handled = handler(editor.view, from, to, character, () => transaction) === true
      return handled
    })
    if (!handled)
      editor.view.dispatch(editor.view.state.tr.insertText(character, from, to))
  }
}

function keyDown(editor: ReturnType<typeof setup>, key: string): boolean {
  let handled = false
  editor.view.someProp('handleKeyDown', (handler) => {
    handled = handler(editor.view, new KeyboardEvent('keydown', { key })) === true
    return handled
  })
  return handled
}

afterEach(() => {
  mountedEditors.splice(0).forEach(unmount => unmount())
})

describe('card authoring extension', () => {
  it.each([
    { direction: 'forward', symbol: '→', trigger: ':-> ' },
    { direction: 'backward', symbol: '←', trigger: ':-< ' },
    { direction: 'both', symbol: '↔', trigger: ':<> ' },
    { direction: 'forward', symbol: '→', trigger: '：-》 ' },
    { direction: 'backward', symbol: '←', trigger: '：-《 ' },
    { direction: 'both', symbol: '↔', trigger: '：《》 ' },
  ] as const)('converts $trigger into a stable $direction delimiter', ({ direction, symbol, trigger }) => {
    const ids = direction === 'both'
      ? ['definition-trigger', 'card-trigger-forward', 'card-trigger-backward']
      : ['definition-trigger', `card-trigger-${direction}`]
    const editor = setup(ids)
    const { doc, paragraph } = editor.nodes
    editor.set(doc(paragraph('<a>')))

    inputText(editor, `Question${trigger}`)

    expect(editor.view.state.doc.textContent).toBe(`Question${symbol}`)
    expect(editor.getDocJSON().content?.[0]?.content?.[1]).toMatchObject({
      attrs: { definitionId: 'definition-trigger', direction },
      type: 'cardDelimiter',
    })
  })

  it('restores the exact typed trigger including its trailing space on immediate Backspace', () => {
    const editor = setup(['definition-trigger', 'card-trigger-forward'])
    const { doc, paragraph } = editor.nodes
    editor.set(doc(paragraph('<a>')))
    inputText(editor, 'Question:-> ')

    expect(keyDown(editor, 'Backspace')).toBe(true)

    expect(editor.getDocJSON()).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Question:-> ' }] }],
    })
  })

  it('inserts a stable forward Basic delimiter at the current rich-content position', () => {
    const editor = setup(['definition-basic', 'card-forward'])
    const { doc, paragraph } = editor.nodes
    editor.set(doc(paragraph('Question<a>Answer')))

    editor.commands.insertBasicCard({ direction: 'forward' })

    expect(editor.getDocJSON()).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Question' },
          {
            type: 'cardDelimiter',
            attrs: {
              backwardCardId: null,
              definitionId: 'definition-basic',
              direction: 'forward',
              forwardCardId: 'card-forward',
            },
          },
          { type: 'text', text: 'Answer' },
        ],
      }],
    })
  })

  it.each([
    {
      direction: 'backward' as const,
      ids: ['definition-reverse', 'card-reverse'],
      expected: {
        backwardCardId: 'card-reverse',
        definitionId: 'definition-reverse',
        direction: 'backward',
        forwardCardId: null,
      },
      label: 'Reverse',
    },
    {
      direction: 'both' as const,
      ids: ['definition-both', 'card-both-forward', 'card-both-backward'],
      expected: {
        backwardCardId: 'card-both-backward',
        definitionId: 'definition-both',
        direction: 'both',
        forwardCardId: 'card-both-forward',
      },
      label: 'Bidirectional',
    },
  ])('inserts stable CardIDs for $label Basic authoring', ({ direction, expected, ids }) => {
    const editor = setup(ids)
    const { doc, paragraph } = editor.nodes
    editor.set(doc(paragraph('Question<a>Answer')))

    editor.commands.insertBasicCard({ direction })

    expect(editor.getDocJSON().content?.[0]?.content?.[1]).toEqual({
      type: 'cardDelimiter',
      attrs: expected,
    })
  })

  it('creates a RichContentCloze mark with stable Card and group identities', () => {
    const editor = setup(['definition-cloze', 'group-cloze', 'card-cloze'])
    const { doc, paragraph } = editor.nodes
    editor.set(doc(paragraph('<a>Euler proved<b> the identity')))

    editor.commands.addCloze({ anchorKind: 'rich-content' })

    expect(editor.getDocJSON()).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          {
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
            text: 'Euler proved',
          },
          { type: 'text', text: ' the identity' },
        ],
      }],
    })
  })

  it('rejects a RichContentCloze selection spanning Source Blocks', () => {
    const editor = setup(['definition-invalid', 'group-invalid', 'card-invalid'])
    const { doc, paragraph } = editor.nodes
    editor.set(doc(
      paragraph('<a>First source'),
      paragraph('Second source<b>'),
    ))
    const before = editor.getDocJSON()

    expect(editor.commands.addCloze.canExec({ anchorKind: 'rich-content' })).toBe(false)
    expect(editor.commands.addCloze({ anchorKind: 'rich-content' })).toBe(false)
    expect(editor.getDocJSON()).toEqual(before)
  })

  it('adds a MathSourceCloze inside LaTeX source using a shared ClozeGroup identity', () => {
    const identity = {
      cardId: 'card-euler',
      definitionId: 'definition-euler',
      groupId: 'group-euler',
    }
    const extension = union(defineBasicExtension(), defineMathInlineSpec(), defineCardExtension())
    const editor = createTestEditor({ extension })
    const element = document.body.appendChild(document.createElement('div'))
    editor.mount(element)
    mountedEditors.push(() => {
      editor.unmount()
      element.remove()
    })
    const { doc, mathInline, paragraph } = editor.nodes
    editor.set(doc(paragraph('Euler: ', mathInline('e^{<a>i\\pi<b>} + 1 = 0'))))

    editor.commands.addCloze({ anchorKind: 'math-source', identity })

    expect(editor.getDocJSON()).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Euler: ' },
          {
            type: 'mathInline',
            content: [
              { type: 'text', text: 'e^{' },
              {
                type: 'text',
                marks: [{
                  type: 'cloze',
                  attrs: { anchorKind: 'math-source', ...identity },
                }],
                text: 'i\\pi',
              },
              { type: 'text', text: '} + 1 = 0' },
            ],
          },
        ],
      }],
    })
  })

  it('adds a MathSourceCloze inside a block formula LaTeX source', () => {
    const identity = {
      cardId: 'card-block-formula',
      definitionId: 'definition-block-formula',
      groupId: 'group-block-formula',
    }
    const extension = union(defineBasicExtension(), defineMathBlockSpec(), defineCardExtension())
    const editor = createTestEditor({ extension })
    const element = document.body.appendChild(document.createElement('div'))
    editor.mount(element)
    mountedEditors.push(() => {
      editor.unmount()
      element.remove()
    })
    const { doc, mathBlock } = editor.nodes
    editor.set(doc(mathBlock('e^{<a>i\\pi<b>} + 1 = 0')))

    expect(editor.commands.addCloze({ anchorKind: 'math-source', identity })).toBe(true)

    expect(editor.getDocJSON()).toEqual({
      type: 'doc',
      content: [{
        type: 'mathBlock',
        attrs: { language: 'tex' },
        content: [
          { type: 'text', text: 'e^{' },
          {
            type: 'text',
            marks: [{
              type: 'cloze',
              attrs: { anchorKind: 'math-source', ...identity },
            }],
            text: 'i\\pi',
          },
          { type: 'text', text: '} + 1 = 0' },
        ],
      }],
    })
  })

  it('rejects the MathSourceCloze path outside a math source node', () => {
    const editor = setup(['definition-invalid', 'group-invalid', 'card-invalid'])
    const { doc, paragraph } = editor.nodes
    editor.set(doc(paragraph('<a>ordinary text<b>')))

    expect(editor.commands.addCloze({ anchorKind: 'math-source' })).toBe(false)
    expect(editor.getDocJSON()).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ordinary text' }] }],
    })
  })

  it('uses the RichContentCloze path when a selection includes an entire inline formula', () => {
    const identity = {
      cardId: 'card-energy',
      definitionId: 'definition-energy',
      groupId: 'group-energy',
    }
    const extension = union(defineBasicExtension(), defineMathInlineSpec(), defineCardExtension())
    const editor = createTestEditor({ extension })
    const element = document.body.appendChild(document.createElement('div'))
    editor.mount(element)
    mountedEditors.push(() => {
      editor.unmount()
      element.remove()
    })
    const { doc, mathInline, paragraph } = editor.nodes
    editor.set(doc(paragraph('<a>Energy ', mathInline('E = mc^2'), '<b> relation')))

    editor.commands.addCloze({ anchorKind: 'rich-content', identity })

    expect(editor.getDocJSON().content?.[0]?.content).toEqual([
      {
        type: 'text',
        marks: [{ type: 'cloze', attrs: { anchorKind: 'rich-content', ...identity } }],
        text: 'Energy ',
      },
      {
        type: 'mathInline',
        content: [{
          type: 'text',
          marks: [{ type: 'cloze', attrs: { anchorKind: 'rich-content', ...identity } }],
          text: 'E = mc^2',
        }],
      },
      { type: 'text', text: ' relation' },
    ])
  })

  it('converts an inline answer into an explicit ordered Card member without changing the Definition or forward CardID', () => {
    const editor = setup(['definition-list', 'card-list-forward'])
    const { doc, paragraph } = editor.nodes
    editor.set(doc(paragraph('First two alkali metals<a>Lithium')))
    editor.commands.toggleList({ kind: 'outline' })
    editor.commands.insertBasicCard({ direction: 'forward' })

    editor.commands.setCardPresentation({ presentation: 'list' })

    const block = editor.getDocJSON().content?.[0]
    expect(block?.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'First two alkali metals' },
          {
            type: 'cardDelimiter',
            attrs: {
              backwardCardId: null,
              definitionId: 'definition-list',
              direction: 'forward',
              forwardCardId: 'card-list-forward',
            },
          },
        ],
      },
      expect.objectContaining({
        attrs: expect.objectContaining({
          cardItemDefinitionId: 'definition-list',
          kind: 'ordered',
        }),
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lithium' }] }],
        type: 'list',
      }),
    ])
  })

  it('moves a trailing inline answer into the same Card when Enter follows its delimiter', () => {
    const editor = setup(['definition-set', 'card-set-forward'])
    const { doc, paragraph } = editor.nodes
    editor.set(doc(paragraph('Question<a>Answer')))
    editor.commands.toggleList({ kind: 'outline' })
    editor.commands.insertBasicCard({ direction: 'forward' })

    expect(keyDown(editor, 'Enter')).toBe(true)

    const source = editor.getDocJSON().content?.[0]
    expect(source?.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Question' },
          {
            type: 'cardDelimiter',
            attrs: {
              backwardCardId: null,
              definitionId: 'definition-set',
              direction: 'forward',
              forwardCardId: 'card-set-forward',
            },
          },
        ],
      },
      expect.objectContaining({
        attrs: expect.objectContaining({
          cardItemDefinitionId: 'definition-set',
          kind: 'outline',
        }),
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Answer' }] }],
        type: 'list',
      }),
    ])
  })

  it('preserves an existing non-ordered Block kind when choosing Set presentation', () => {
    const editor = setup([])
    const document = editor.view.state.schema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'list',
        attrs: { checked: false, collapsed: false, kind: 'outline', order: null },
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Question' },
            {
              type: 'cardDelimiter',
              attrs: {
                backwardCardId: null,
                definitionId: 'definition-set',
                direction: 'forward',
                forwardCardId: 'card-set-forward',
              },
            },
          ],
        }, {
          type: 'list',
          attrs: {
            cardItemDefinitionId: 'definition-set',
            checked: false,
            collapsed: false,
            kind: 'task',
            order: null,
          },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Answer' }] }],
        }],
      }],
    })
    editor.set(document)
    editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 2)))

    editor.commands.setCardPresentation({ presentation: 'set' })

    expect(editor.getDocJSON().content?.[0]?.content?.[1]?.attrs?.kind).toBe('task')
  })

  it('preserves existing directional CardIDs when direction and answer presentation change', () => {
    const editor = setup(['definition-set', 'card-set-forward', 'card-set-backward'])
    const { doc, paragraph } = editor.nodes
    editor.set(doc(paragraph('Primary colors<a>Red')))
    editor.commands.toggleList({ kind: 'outline' })
    editor.commands.insertBasicCard({ direction: 'forward' })
    editor.commands.setCardPresentation({ presentation: 'set' })

    editor.commands.setCardDirection({ direction: 'both' })
    editor.commands.setCardPresentation({ presentation: 'list' })

    const parent = editor.getDocJSON().content?.[0]
    expect(parent?.content?.[0]?.content?.[1]).toEqual({
      type: 'cardDelimiter',
      attrs: {
        backwardCardId: 'card-set-backward',
        definitionId: 'definition-set',
        direction: 'both',
        forwardCardId: 'card-set-forward',
      },
    })
    expect(parent?.content?.[1]?.attrs).toMatchObject({
      cardItemDefinitionId: 'definition-set',
      kind: 'ordered',
    })
  })

  it('adds and removes a palette-backed inline Highlight', () => {
    const editor = setup([])
    const { doc, paragraph } = editor.nodes
    editor.set(doc(paragraph('Remember <a>this phrase<b> today')))

    editor.commands.setInlineHighlight({ color: 'yellow' })

    expect(editor.getDocJSON().content?.[0]?.content?.[1]).toEqual({
      type: 'text',
      marks: [{ type: 'inlineHighlight', attrs: { color: 'yellow', id: expect.any(String) } }],
      text: 'this phrase',
    })

    editor.commands.removeInlineHighlight()
    expect(editor.getDocJSON().content?.[0]?.content).toEqual([
      { type: 'text', text: 'Remember this phrase today' },
    ])
  })

  it('adds and removes a whole-block Highlight on the current outline block', () => {
    const editor = setup([])
    const { doc, paragraph } = editor.nodes
    editor.set(doc(paragraph('<a>Highlighted block')))
    editor.commands.toggleList({ kind: 'outline' })

    editor.commands.setBlockHighlight({ color: 'blue' })
    expect(editor.getDocJSON().content?.[0]?.attrs?.blockHighlight).toBe('blue')

    editor.commands.removeBlockHighlight()
    expect(editor.getDocJSON().content?.[0]?.attrs?.blockHighlight).toBeNull()
  })
})
