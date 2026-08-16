import type { NodeJSON } from 'prosekit/core'
import type { OcclusionShape } from '../image-occlusion/image-occlusion-model'
import { describe, expect, it } from 'vitest'
import {
  containOcclusionBoundsShape,
  shouldRegroupImageOcclusionShapes,
  translateOcclusionBrushShape,
} from '../image-occlusion/image-occlusion-model'

import { projectEditorCards } from './card-model'

function block(id: string, content: readonly NodeJSON[], attrs: Record<string, unknown> = {}): NodeJSON {
  return {
    type: 'list',
    attrs: {
      blockId: id,
      blockHighlight: null,
      blockHighlightId: null,
      checked: false,
      collapsed: false,
      kind: 'outline',
      order: null,
      ...attrs,
    },
    content: [...content],
  }
}

function delimiter(
  definitionId: string,
  direction: 'backward' | 'both' | 'forward',
  forwardCardId: string | null,
  backwardCardId: string | null,
): NodeJSON {
  return {
    type: 'cardDelimiter',
    attrs: { backwardCardId, definitionId, direction, forwardCardId },
  }
}

describe('projectEditorCards', () => {
  it('ignores a non-Card Block without regular Editor Highlight attributes', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [{
        type: 'list',
        attrs: { blockId: 'reader-block' },
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'Reader content' }],
        }],
      }],
    }

    expect(projectEditorCards(document)).toEqual([])
  })

  it('projects a forward Basic Card from a stable inline delimiter', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [
        block('block-basic', [{
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Mitochondria' },
            {
              type: 'cardDelimiter',
              attrs: {
                backwardCardId: null,
                definitionId: 'definition-basic',
                direction: 'forward',
                forwardCardId: 'card-forward',
              },
            },
            { type: 'text', marks: [{ type: 'bold' }], text: 'Powerhouse of the cell' },
          ],
        }]),
      ],
    }

    expect(projectEditorCards(document)).toEqual([{
      back: [{
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Powerhouse of the cell' }],
      }],
      blockHighlight: null,
      definitionId: 'definition-basic',
      direction: 'forward',
      front: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Mitochondria' }],
      }],
      id: 'card-forward',
      kind: 'basic',
      sourceBlockId: 'block-basic',
    }])
  })

  it('retains the same CardID when Basic Card content changes', () => {
    const definition = {
      backwardCardId: null,
      definitionId: 'definition-stable',
      direction: 'forward',
      forwardCardId: 'card-stable',
    }
    const before: NodeJSON = {
      type: 'doc',
      content: [block('block-stable', [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Question' },
          { type: 'cardDelimiter', attrs: definition },
          { type: 'text', text: 'Old answer' },
        ],
      }])],
    }
    const after = structuredClone(before)
    const answer = after.content?.[0]?.content?.[0]?.content?.[2]
    if (!answer)
      throw new Error('Expected the edited Basic answer node')
    answer.text = 'New answer'

    expect(projectEditorCards(before).map(card => ({ id: card.id, kind: card.kind }))).toEqual([
      { id: 'card-stable', kind: 'basic' },
    ])
    expect(projectEditorCards(after)).toEqual([
      expect.objectContaining({
        back: [{ type: 'paragraph', content: [{ type: 'text', text: 'New answer' }] }],
        id: 'card-stable',
      }),
    ])
  })

  it('projects a Reverse Card with the answer on the front', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [block('block-reverse', [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Term' },
          {
            type: 'cardDelimiter',
            attrs: {
              backwardCardId: 'card-backward',
              definitionId: 'definition-reverse',
              direction: 'backward',
              forwardCardId: null,
            },
          },
          { type: 'text', text: 'Definition' },
        ],
      }])],
    }

    expect(projectEditorCards(document)).toEqual([{
      back: [{ type: 'paragraph', content: [{ type: 'text', text: 'Term' }] }],
      blockHighlight: null,
      definitionId: 'definition-reverse',
      direction: 'backward',
      front: [{ type: 'paragraph', content: [{ type: 'text', text: 'Definition' }] }],
      id: 'card-backward',
      kind: 'basic',
      sourceBlockId: 'block-reverse',
    }])
  })

  it('projects independent forward and backward Cards for Bidirectional authoring', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [block('block-both', [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Question' },
          {
            type: 'cardDelimiter',
            attrs: {
              backwardCardId: 'card-both-backward',
              definitionId: 'definition-both',
              direction: 'both',
              forwardCardId: 'card-both-forward',
            },
          },
          { type: 'text', text: 'Answer' },
        ],
      }])],
    }

    expect(projectEditorCards(document)
      .filter(card => card.kind === 'basic')
      .map(card => ({ direction: card.direction, id: card.id }))).toEqual([
      { direction: 'forward', id: 'card-both-forward' },
      { direction: 'backward', id: 'card-both-backward' },
    ])
  })

  it('keeps a disabled Basic definition out of the active Card projection', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [block('block-disabled', [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Question' },
          {
            type: 'cardDelimiter',
            attrs: {
              backwardCardId: 'card-disabled-backward',
              definitionId: 'definition-disabled',
              direction: 'disabled',
              forwardCardId: 'card-disabled-forward',
            },
          },
          { type: 'text', text: 'Answer' },
        ],
      }])],
    }

    expect(projectEditorCards(document)).toEqual([])
  })

  it('projects one Cloze Card from mixed rich-content and math-source anchors', () => {
    const richContentCloze = {
      attrs: {
        anchorKind: 'rich-content',
        cardId: 'card-euler',
        definitionId: 'definition-euler',
        groupId: 'group-euler',
      },
      type: 'cloze',
    }
    const mathSourceCloze = {
      attrs: {
        anchorKind: 'math-source',
        cardId: 'card-euler',
        definitionId: 'definition-euler',
        groupId: 'group-euler',
      },
      type: 'cloze',
    }
    const content: NodeJSON[] = [{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Euler proved ', marks: [richContentCloze] },
        {
          type: 'mathInline',
          content: [
            { type: 'text', text: 'e^{i\\pi} + ' },
            { type: 'text', text: '1', marks: [mathSourceCloze] },
            { type: 'text', text: ' = 0' },
          ],
        },
      ],
    }]
    const document: NodeJSON = {
      type: 'doc',
      content: [block('block-euler', content)],
    }

    expect(projectEditorCards(document)).toEqual([{
      blockHighlight: null,
      clozeGroupId: 'group-euler',
      content,
      definitionId: 'definition-euler',
      id: 'card-euler',
      kind: 'cloze',
      sourceBlockId: 'block-euler',
    }])
  })

  it('rejects one Cloze DefinitionID mapped to multiple CardIDs or ClozeGroups', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [block('block-conflicting-cloze', [{
        type: 'paragraph',
        content: [
          {
            type: 'text',
            marks: [{
              type: 'cloze',
              attrs: {
                anchorKind: 'rich-content',
                cardId: 'card-first',
                definitionId: 'definition-shared',
                groupId: 'group-first',
              },
            }],
            text: 'first',
          },
          { type: 'text', text: ' and ' },
          {
            type: 'text',
            marks: [{
              type: 'cloze',
              attrs: {
                anchorKind: 'rich-content',
                cardId: 'card-second',
                definitionId: 'definition-shared',
                groupId: 'group-second',
              },
            }],
            text: 'second',
          },
        ],
      }])],
    }

    expect(() => projectEditorCards(document)).toThrow(
      'Cloze DefinitionID definition-shared has inconsistent CardID or ClozeGroup ID',
    )
  })

  it('rejects one Cloze DefinitionID reused with another identity in a different Source Block', () => {
    const clozeText = (text: string, cardId: string, groupId: string): NodeJSON => ({
      type: 'text',
      marks: [{
        type: 'cloze',
        attrs: {
          anchorKind: 'rich-content',
          cardId,
          definitionId: 'definition-cross-block',
          groupId,
        },
      }],
      text,
    })
    const document: NodeJSON = {
      type: 'doc',
      content: [
        block('block-first', [{ type: 'paragraph', content: [clozeText('first', 'card-first', 'group-first')] }]),
        block('block-second', [{ type: 'paragraph', content: [clozeText('second', 'card-second', 'group-second')] }]),
      ],
    }

    expect(() => projectEditorCards(document)).toThrow(
      'Cloze DefinitionID definition-cross-block has inconsistent CardID or ClozeGroup ID',
    )
  })

  it('projects a ListCard with stable direct-child items in reveal order', () => {
    const itemOne = block('item-one', [
      { type: 'paragraph', content: [{ type: 'text', text: 'Lithium' }] },
    ], { cardItemDefinitionId: 'definition-list', kind: 'ordered', order: 1 })
    const itemTwo = block('item-two', [
      { type: 'paragraph', content: [{ type: 'text', text: 'Sodium' }] },
    ], { cardItemDefinitionId: 'definition-list', kind: 'ordered', order: 2 })
    const ordinaryChild = block('ordinary-child', [
      { type: 'paragraph', content: [{ type: 'text', text: 'Not part of the answer' }] },
    ], { kind: 'ordered', order: 3 })
    const document: NodeJSON = {
      type: 'doc',
      content: [block('block-list', [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'First two alkali metals' },
            delimiter('definition-list', 'forward', 'card-list-forward', null),
          ],
        },
        itemOne,
        itemTwo,
        ordinaryChild,
      ])],
    }

    expect(projectEditorCards(document)).toEqual([{
      blockHighlight: null,
      definitionId: 'definition-list',
      direction: 'forward',
      id: 'card-list-forward',
      items: [
        {
          blockId: 'item-one',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lithium' }] }],
        },
        {
          blockId: 'item-two',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sodium' }] }],
        },
      ],
      kind: 'list',
      prompt: [{ type: 'paragraph', content: [{ type: 'text', text: 'First two alkali metals' }] }],
      sourceBlockId: 'block-list',
    }])
  })

  it('projects independent forward and backward ListCards while retaining a whole-block Highlight', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [block('block-planets', [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Inner planets' },
            delimiter('definition-planets', 'both', 'card-planets-forward', 'card-planets-backward'),
          ],
        },
        block('item-mercury', [{ type: 'paragraph', content: [{ type: 'text', text: 'Mercury' }] }], {
          cardItemDefinitionId: 'definition-planets',
          kind: 'ordered',
        }),
        block('item-venus', [{ type: 'paragraph', content: [{ type: 'text', text: 'Venus' }] }], {
          cardItemDefinitionId: 'definition-planets',
          kind: 'ordered',
        }),
      ], {
        blockHighlight: 'blue',
        blockHighlightId: 'highlight-planets',
      })],
    }

    expect(projectEditorCards(document)).toEqual([
      expect.objectContaining({
        blockHighlight: 'blue',
        direction: 'forward',
        id: 'card-planets-forward',
        kind: 'list',
      }),
      expect.objectContaining({
        blockHighlight: 'blue',
        direction: 'backward',
        id: 'card-planets-backward',
        kind: 'list',
      }),
      expect.objectContaining({
        blockHighlight: 'blue',
        id: 'highlight-planets',
        kind: 'highlight',
      }),
    ])
  })

  it('projects a SetCard while retaining inline Highlights in its items', () => {
    const highlighted = { type: 'inlineHighlight', attrs: { color: 'yellow', id: 'highlight-red' } }
    const document: NodeJSON = {
      type: 'doc',
      content: [block('block-colors', [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Primary colors' },
            delimiter('definition-colors', 'forward', 'card-colors-forward', null),
          ],
        },
        block('item-red', [{
          type: 'paragraph',
          content: [{ type: 'text', marks: [highlighted], text: 'Red' }],
        }], { cardItemDefinitionId: 'definition-colors', kind: 'bullet' }),
      ])],
    }

    expect(projectEditorCards(document)).toEqual([
      {
        blockHighlight: null,
        definitionId: 'definition-colors',
        direction: 'forward',
        id: 'card-colors-forward',
        items: [{
          blockId: 'item-red',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', marks: [highlighted], text: 'Red' }],
          }],
        }],
        kind: 'set',
        prompt: [{ type: 'paragraph', content: [{ type: 'text', text: 'Primary colors' }] }],
        sourceBlockId: 'block-colors',
      },
      {
        blockHighlight: null,
        content: [{
          content: [{ marks: [highlighted], text: 'Red', type: 'text' }],
          type: 'paragraph',
        }],
        id: 'highlight-red',
        kind: 'highlight',
        sourceBlockId: 'item-red',
      },
    ])
  })

  it('does not infer Card membership from indentation or numbered-list presentation', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [block('block-explicit-membership', [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Prompt' },
            delimiter('definition-explicit', 'forward', 'card-explicit', null),
          ],
        },
        block('ordinary-numbered-child', [
          { type: 'paragraph', content: [{ type: 'text', text: 'Ordinary child' }] },
        ], { kind: 'ordered' }),
      ])],
    }

    expect(projectEditorCards(document)).toEqual([expect.objectContaining({
      back: [{ type: 'paragraph' }],
      id: 'card-explicit',
      kind: 'basic',
    })])
  })

  it('does not retain the removed parent cardMode document representation', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [block('legacy-parent', [
        { type: 'paragraph', content: [{ type: 'text', text: 'Legacy prompt' }] },
        block('legacy-child', [{ type: 'paragraph', content: [{ type: 'text', text: 'Legacy answer' }] }], {
          kind: 'ordered',
        }),
      ], {
        cardDefinitionId: 'legacy-definition',
        cardDirection: 'forward',
        cardMode: 'list',
        forwardCardId: 'legacy-card',
      })],
    }

    expect(projectEditorCards(document)).toEqual([])
  })

  it('rejects an inline Highlight without a stable source ID', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [block('missing-inline-highlight-id', [{
        type: 'paragraph',
        content: [{
          marks: [{ attrs: { color: 'yellow' }, type: 'inlineHighlight' }],
          text: 'Highlighted source',
          type: 'text',
        }],
      }])],
    }

    expect(() => projectEditorCards(document)).toThrow('Inline Highlight ID must be a non-empty string')
  })

  it('rejects a Block Highlight without a stable source ID', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [block('missing-block-highlight-id', [{
        type: 'paragraph',
        content: [{ text: 'Highlighted source', type: 'text' }],
      }], { blockHighlight: 'blue' })],
    }

    expect(() => projectEditorCards(document)).toThrow('Block Highlight color and ID must be provided together')
  })

  it('rejects mixed Set and List presentation among explicit Card members', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [block('block-mixed', [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Prompt' },
            delimiter('definition-mixed', 'forward', 'card-mixed', null),
          ],
        },
        block('ordered-member', [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }], {
          cardItemDefinitionId: 'definition-mixed',
          kind: 'ordered',
        }),
        block('bullet-member', [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }], {
          cardItemDefinitionId: 'definition-mixed',
          kind: 'bullet',
        }),
      ])],
    }

    expect(() => projectEditorCards(document)).toThrow('mixes ordered and non-ordered Card members')
  })
})

describe('image occlusion editing geometry', () => {
  const groupedShapes: readonly OcclusionShape[] = [{
    groupId: 'stable-card',
    height: 0.2,
    id: 'first-shape',
    kind: 'rectangle' as const,
    width: 0.2,
    x: 0.1,
    y: 0.1,
  }, {
    groupId: 'stable-card',
    height: 0.2,
    id: 'second-shape',
    kind: 'ellipse' as const,
    width: 0.2,
    x: 0.4,
    y: 0.4,
  }]

  it('does not replace a CardID when the complete existing group is selected', () => {
    expect(shouldRegroupImageOcclusionShapes(groupedShapes, ['first-shape', 'second-shape'])).toBe(false)
    expect(shouldRegroupImageOcclusionShapes(groupedShapes, ['first-shape'])).toBe(false)
    expect(shouldRegroupImageOcclusionShapes([
      ...groupedShapes,
      {
        groupId: 'another-card',
        height: 0.2,
        id: 'third-shape',
        kind: 'ellipse',
        width: 0.2,
        x: 0.7,
        y: 0.7,
      },
    ], ['first-shape', 'third-shape'])).toBe(true)
  })

  it('keeps a bounds shape size stable when moved beyond an image edge', () => {
    expect(containOcclusionBoundsShape({
      groupId: 'card',
      height: 0.3,
      id: 'shape',
      kind: 'rectangle',
      width: 0.2,
      x: 0.95,
      y: -0.1,
    })).toEqual({
      groupId: 'card',
      height: 0.3,
      id: 'shape',
      kind: 'rectangle',
      width: 0.2,
      x: 0.8,
      y: 0,
    })
  })

  it('keeps brush point spacing stable when moved beyond an image edge', () => {
    const translated = translateOcclusionBrushShape({
      groupId: 'card',
      id: 'brush',
      kind: 'brush',
      points: [0.1, 0.2, 0.3, 0.4],
      strokeWidth: 0.025,
    }, 1, -1)
    expect(translated.points).toHaveLength(4)
    expect(translated.points[0]).toBeCloseTo(0.8)
    expect(translated.points[1]).toBeCloseTo(0)
    expect(translated.points[2]).toBeCloseTo(1)
    expect(translated.points[3]).toBeCloseTo(0.2)
  })
})
