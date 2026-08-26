import type { NodeJSON } from 'prosekit/core'
import type { RegularTopicSnapshot } from './editor-note'
import { describe, expect, it } from 'vitest'
import { EditorMode } from '../common/editor-mode'
import { createEditorNote } from './editor-note'

type CardKind = 'basic' | 'cloze' | 'highlight' | 'list' | 'set'

function paragraph(text: string, marks?: NodeJSON['marks']): NodeJSON {
  return {
    type: 'paragraph',
    content: [{ ...(marks ? { marks } : {}), text, type: 'text' }],
  }
}

function paragraphContent(content: readonly NodeJSON[]): NodeJSON {
  return { content: [...content], type: 'paragraph' }
}

function block(
  blockId: string,
  content: readonly NodeJSON[],
  attrs: Readonly<Record<string, unknown>> = {},
): NodeJSON {
  return {
    attrs: {
      blockHighlight: null,
      blockHighlightId: null,
      blockId,
      cardItemDefinitionId: null,
      checked: false,
      collapsed: false,
      kind: 'outline',
      order: null,
      ...attrs,
    },
    content: [...content],
    type: 'list',
  }
}

function delimiter(
  definitionId: string,
  forwardCardId: string,
  direction: 'forward' | 'backward' | 'both' = 'forward',
): NodeJSON {
  return {
    attrs: {
      backwardCardId: direction === 'backward' ? `card-${definitionId}-backward` : null,
      definitionId,
      direction,
      forwardCardId: direction === 'backward' ? null : forwardCardId,
    },
    type: 'cardDelimiter',
  }
}

function clozeMark(
  cardId: string,
  definitionId: string,
  groupId: string,
): NonNullable<NodeJSON['marks']>[number] {
  return {
    attrs: { anchorKind: 'rich-content', cardId, definitionId, groupId },
    type: 'cloze',
  }
}

function inlineHighlightMark(id: string): NonNullable<NodeJSON['marks']>[number] {
  return { attrs: { color: 'yellow', id }, type: 'inlineHighlight' }
}

function sourceDocument(): NodeJSON {
  return {
    content: [
      block('basic-source', [paragraphContent([
        { text: 'BBBBBBBBBBBBBBBBBBBBBBBBB', type: 'text' },
        delimiter('basic-definition', 'basic-card'),
      ])]),
      block('list-source', [
        paragraphContent([
          { text: 'LLLLLLLLLLLLLLLLLLLLLLLLL', type: 'text' },
          delimiter('list-definition', 'list-card'),
        ]),
        block('list-item-one', [paragraph('Lithium')], {
          cardItemDefinitionId: 'list-definition',
          kind: 'ordered',
          order: 1,
        }),
        block('list-item-two', [paragraph('Sodium')], {
          cardItemDefinitionId: 'list-definition',
          kind: 'ordered',
          order: 2,
        }),
      ]),
      block('set-source', [
        paragraphContent([
          { text: 'SSSSSSSSSSSSSSSSSSSSSSSSS', type: 'text' },
          delimiter('set-definition', 'set-card'),
        ]),
        block('set-item-one', [paragraph('Red')], {
          cardItemDefinitionId: 'set-definition',
          kind: 'bullet',
        }),
        block('set-item-two', [paragraph('Blue')], {
          cardItemDefinitionId: 'set-definition',
          kind: 'bullet',
        }),
      ]),
      block('cloze-source', [
        paragraphContent([
          { marks: [clozeMark('cloze-card', 'cloze-definition', 'cloze-group')], text: 'CCCCCCCCCCCCCCCCCCCCCCCCC', type: 'text' },
          { text: ' / ', type: 'text' },
          { marks: [clozeMark('second-cloze-card', 'second-cloze-definition', 'second-cloze-group')], text: 'DDDDDDDDDDDDDDDDDDDDDDDDD', type: 'text' },
        ]),
      ]),
      block('inline-source', [
        paragraphContent([
          { marks: [inlineHighlightMark('inline-highlight')], text: 'IIIIIIIIIIIIIIIIIIIIIIIII', type: 'text' },
          { text: ' / ', type: 'text' },
          { marks: [inlineHighlightMark('second-inline-highlight')], text: 'JJJJJJJJJJJJJJJJJJJJJJJJJ', type: 'text' },
        ]),
      ]),
      block('block-highlight-source', [
        paragraph('HHHHHHHHHHHHHHHHHHHHHHHHH'),
      ], { blockHighlight: 'blue', blockHighlightId: 'block-highlight' }),
    ],
    type: 'doc',
  }
}

function createFixture() {
  const note = createEditorNote({
    id: 'card-topic-lifecycle',
    initialTopic: {
      initialContent: sourceDocument(),
      mode: EditorMode.Outline,
      title: 'Regular source',
    },
  })
  const sourceTopic = note.getEntries().find(entry => (
    entry.kind === 'topic' && entry.topicType === 'regular' && entry.title === 'Regular source'
  ))
  if (!sourceTopic || sourceTopic.kind !== 'topic' || sourceTopic.topicType !== 'regular')
    throw new Error('Expected the regular source Topic')
  note.reconcileCardTopics({ document: sourceDocument(), topicId: sourceTopic.id })
  return { note, sourceTopicId: sourceTopic.id }
}

function childTopics(
  note: ReturnType<typeof createEditorNote>,
  parentId: string,
): RegularTopicSnapshot[] {
  return note.getEntries().filter((entry): entry is RegularTopicSnapshot => (
    entry.kind === 'topic'
    && entry.topicType === 'regular'
    && entry.parentId === parentId
    && entry.cardSource?.sourceTopicId === parentId
  ))
}

function childBySource(
  note: ReturnType<typeof createEditorNote>,
  parentId: string,
  kind: CardKind,
  sourceId: string,
) {
  const child = childTopics(note, parentId).find(entry => (
    entry.cardSource?.kind === kind && entry.cardSource.sourceId === sourceId
  ))
  if (!child || child.kind !== 'topic' || child.topicType !== 'regular')
    throw new Error(`Missing ${kind} child Topic ${sourceId}`)
  return child
}

function documentOf(note: ReturnType<typeof createEditorNote>, topicId: string): NodeJSON {
  const validation = note.getTopicValidationInput(topicId)
  if (!('document' in validation))
    throw new Error(`Topic ${topicId} does not contain an editable document`)
  return validation.document
}

function textContent(document: NodeJSON): string {
  const text: string[] = []
  const visit = (node: NodeJSON): void => {
    if (typeof node.text === 'string') {
      text.push(node.text)
      return
    }
    node.content?.forEach(visit)
  }
  visit(document)
  return text.join('')
}

describe('editor note Card Topic lifecycle', () => {
  it('does not create CardTopics for Highlights', () => {
    const { note, sourceTopicId } = createFixture()
    const children = childTopics(note, sourceTopicId)

    expect(children).toHaveLength(5)
    expect(children.map(entry => entry.cardSource?.kind).sort()).toEqual([
      'basic',
      'cloze',
      'cloze',
      'list',
      'set',
    ])
    expect(children.every(entry => entry.cardSource?.syncStatus === 'synced')).toBe(true)
    expect(children.every(entry => entry.cardSource?.sourceTopicId === sourceTopicId)).toBe(true)

    expect(childBySource(note, sourceTopicId, 'basic', 'basic-definition')).toMatchObject({ title: 'BBBBBBBBBBBBBBBBBBBB' })
    expect(childBySource(note, sourceTopicId, 'list', 'list-definition')).toMatchObject({ title: 'LLLLLLLLLLLLLLLLLLLL' })
    expect(childBySource(note, sourceTopicId, 'set', 'set-definition')).toMatchObject({ title: 'SSSSSSSSSSSSSSSSSSSS' })
    expect(childBySource(note, sourceTopicId, 'cloze', 'cloze-group')).toMatchObject({ title: 'CCCCCCCCCCCCCCCCCCCC' })
    expect(childBySource(note, sourceTopicId, 'cloze', 'second-cloze-group')).toMatchObject({ title: 'DDDDDDDDDDDDDDDDDDDD' })

    expect(textContent(documentOf(note, childBySource(note, sourceTopicId, 'cloze', 'cloze-group').id))).toBe('CCCCCCCCCCCCCCCCCCCCCCCCC')
    expect(textContent(documentOf(note, childBySource(note, sourceTopicId, 'cloze', 'second-cloze-group').id))).toBe('DDDDDDDDDDDDDDDDDDDDDDDDD')
  })

  it('creates a Highlight CardTopic only through the explicit command and keeps it synced', () => {
    const { note, sourceTopicId } = createFixture()

    const cardTopicId = note.createCardTopicFromHighlight({
      highlightId: 'inline-highlight',
      sourceTopicId,
    })
    expect(childBySource(note, sourceTopicId, 'highlight', 'inline-highlight').id).toBe(cardTopicId)

    note.applyTopicBlockEdits({
      edits: [{
        blockId: 'inline-source',
        content: [paragraphContent([
          { marks: [inlineHighlightMark('inline-highlight')], text: 'updated highlight', type: 'text' },
        ])],
        operation: 'update-block-content',
      }],
      topicId: sourceTopicId,
    })

    const child = childBySource(note, sourceTopicId, 'highlight', 'inline-highlight')
    expect(child.cardSource?.syncStatus).toBe('synced')
    expect(textContent(documentOf(note, child.id))).toContain('updated highlight')
  })

  it('keeps every synced child content and title aligned after a regular source edit', () => {
    const { note, sourceTopicId } = createFixture()
    note.applyTopicBlockEdits({
      topicId: sourceTopicId,
      edits: [
        { blockId: 'basic-source', content: [paragraphContent([{ text: 'bbbbbbbbbbbbbbbbbbbbbbbbb', type: 'text' }, delimiter('basic-definition', 'basic-card')])], operation: 'update-block-content' },
        { blockId: 'list-source', content: [paragraphContent([{ text: 'lllllllllllllllllllllllll', type: 'text' }, delimiter('list-definition', 'list-card')])], operation: 'update-block-content' },
        { blockId: 'list-item-one', content: [paragraph('Lithium updated')], operation: 'update-block-content' },
        { blockId: 'set-source', content: [paragraphContent([{ text: 'sssssssssssssssssssssssss', type: 'text' }, delimiter('set-definition', 'set-card')])], operation: 'update-block-content' },
        { blockId: 'set-item-one', content: [paragraph('Red updated')], operation: 'update-block-content' },
        { blockId: 'cloze-source', content: [paragraphContent([
          { marks: [clozeMark('cloze-card', 'cloze-definition', 'cloze-group')], text: 'ccccccccccccccccccccccccc', type: 'text' },
          { text: ' / ', type: 'text' },
          { marks: [clozeMark('second-cloze-card', 'second-cloze-definition', 'second-cloze-group')], text: 'ddddddddddddddddddddddddd', type: 'text' },
        ])], operation: 'update-block-content' },
        { blockId: 'inline-source', content: [paragraphContent([
          { marks: [inlineHighlightMark('inline-highlight')], text: 'iiiiiiiiiiiiiiiiiiiiiiiii', type: 'text' },
          { text: ' / ', type: 'text' },
          { marks: [inlineHighlightMark('second-inline-highlight')], text: 'jjjjjjjjjjjjjjjjjjjjjjjjj', type: 'text' },
        ])], operation: 'update-block-content' },
        { blockId: 'block-highlight-source', content: [paragraph('hhhhhhhhhhhhhhhhhhhhhhhhh')], operation: 'update-block-content' },
      ],
    })

    expect(childBySource(note, sourceTopicId, 'basic', 'basic-definition')).toMatchObject({ title: 'bbbbbbbbbbbbbbbbbbbb' })
    expect(childBySource(note, sourceTopicId, 'list', 'list-definition')).toMatchObject({ title: 'llllllllllllllllllll' })
    expect(childBySource(note, sourceTopicId, 'set', 'set-definition')).toMatchObject({ title: 'ssssssssssssssssssss' })
    expect(childBySource(note, sourceTopicId, 'cloze', 'cloze-group')).toMatchObject({ title: 'cccccccccccccccccccc' })
    expect(childBySource(note, sourceTopicId, 'cloze', 'second-cloze-group')).toMatchObject({ title: 'dddddddddddddddddddd' })
    expect(textContent(documentOf(note, childBySource(note, sourceTopicId, 'list', 'list-definition').id))).toContain('Lithium updated')
    expect(textContent(documentOf(note, childBySource(note, sourceTopicId, 'set', 'set-definition').id))).toContain('Red updated')
  })

  it('detaches each edited child, retains the edit, and restores sync through resync', () => {
    const { note, sourceTopicId } = createFixture()
    const children = [
      childBySource(note, sourceTopicId, 'basic', 'basic-definition'),
      childBySource(note, sourceTopicId, 'list', 'list-definition'),
      childBySource(note, sourceTopicId, 'set', 'set-definition'),
      childBySource(note, sourceTopicId, 'cloze', 'cloze-group'),
      childBySource(note, sourceTopicId, 'cloze', 'second-cloze-group'),
    ]

    for (const child of children) {
      const sourceBlockId = documentOf(note, child.id).content?.find(node => node.type === 'list')?.attrs?.blockId
      if (typeof sourceBlockId !== 'string')
        throw new Error(`Missing source Block for child ${child.id}`)
      note.applyTopicBlockEdits({
        topicId: child.id,
        edits: [{ blockId: sourceBlockId, content: [paragraph(`detached ${child.cardSource?.sourceId}`)], operation: 'update-block-content' }],
      })
      expect(note.getEntries().find(entry => entry.id === child.id)).toMatchObject({
        cardSource: { syncStatus: 'detached' },
      })
      expect(textContent(documentOf(note, child.id))).toContain('detached')

      note.resyncCardTopic(child.id)
      expect(note.getEntries().find(entry => entry.id === child.id)).toMatchObject({
        cardSource: { syncStatus: 'synced' },
      })
      expect(textContent(documentOf(note, child.id))).not.toContain('detached')
    }
  })

  it('retains and detaches all child Topics when their source definitions disappear', () => {
    const { note, sourceTopicId } = createFixture()
    const children = childTopics(note, sourceTopicId)

    note.applyTopicBlockEdits({
      topicId: sourceTopicId,
      edits: [
        { blockId: 'basic-source', content: [paragraph('basic without card')], operation: 'update-block-content' },
        { blockId: 'list-source', content: [paragraph('list without card')], operation: 'update-block-content' },
        { blockId: 'set-source', content: [paragraph('set without card')], operation: 'update-block-content' },
        { blockId: 'cloze-source', content: [paragraph('cloze without card')], operation: 'update-block-content' },
        { blockId: 'inline-source', content: [paragraph('highlight without card')], operation: 'update-block-content' },
        { attributes: { blockHighlight: null, blockHighlightId: null }, blockId: 'block-highlight-source', operation: 'update-block-attributes' },
      ],
    })

    const remaining = childTopics(note, sourceTopicId)
    expect(remaining.filter(entry => children.some(child => child.id === entry.id))).toHaveLength(children.length)
    expect(remaining.every(child => child.cardSource?.syncStatus === 'detached')).toBe(true)
  })

  it('does not create a nested CardTopic when a Highlight is added to a CardTopic', () => {
    const { note, sourceTopicId } = createFixture()
    const cloze = childBySource(note, sourceTopicId, 'cloze', 'cloze-group')

    note.applyTopicBlockEdits({
      topicId: cloze.id,
      edits: [{
        blockId: 'cloze-source',
        content: [paragraph('CCCCCCCCCCCCCCCCCCCCCCCCC', [
          clozeMark('cloze-card', 'cloze-definition', 'cloze-group'),
          inlineHighlightMark('nested-inline-highlight'),
        ])],
        operation: 'update-block-content',
      }],
    })
    expect(childTopics(note, cloze.id)).toEqual([])
  })
})
