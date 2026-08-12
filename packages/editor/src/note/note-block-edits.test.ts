import type { NodeJSON } from 'prosekit/core'
import { describe, expect, it } from 'vitest'
import { EditorMode } from '../common/editor-mode'
import { createEditorNote } from './editor-note'

function paragraph(text: string): NodeJSON {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function block(blockId: string, text: string, children: readonly NodeJSON[] = []): NodeJSON {
  return {
    type: 'list',
    attrs: { blockId, checked: false, collapsed: false, kind: 'outline', order: null },
    content: [paragraph(text), ...children],
  }
}

function createFixture() {
  const note = createEditorNote({ id: 'topic-block-edits' })
  const [defaultTopic] = note.getEntries()
  if (!defaultTopic || defaultTopic.kind !== 'topic')
    throw new Error('Fixture Note is missing its default Topic')
  note.deleteEntry({ entryId: defaultTopic.id, strategy: 'delete-subtree' })
  const topicId = note.createTopic({
    initialContent: {
      type: 'doc',
      content: [
        block('parent', 'Parent', [block('child-a', 'A'), block('child-c', 'C')]),
        block('tail', 'Tail'),
      ],
    },
    mode: EditorMode.Outline,
    title: 'Structured Topic',
  })
  return { note, topicId }
}

function documentOf(fixture: ReturnType<typeof createFixture>): NodeJSON {
  const validation = fixture.note.getTopicValidationInput(fixture.topicId)
  if (!('document' in validation))
    throw new Error('Fixture Topic must have a document')
  return validation.document
}

function findBlock(document: NodeJSON, blockId: string): NodeJSON {
  const visit = (nodes: readonly NodeJSON[]): NodeJSON | undefined => {
    for (const node of nodes) {
      if (node.attrs?.blockId === blockId)
        return node
      const found = visit(node.content ?? [])
      if (found)
        return found
    }
  }
  const found = visit(document.content ?? [])
  if (!found)
    throw new Error(`Missing Block ${blockId}`)
  return found
}

function childBlockIds(node: NodeJSON): unknown[] {
  return (node.content ?? []).filter(child => child.type === 'list').map(child => child.attrs?.blockId)
}

describe('structured Topic Block edits in EditorNote', () => {
  it('applies sequential insert, content, attribute, and move operations as one batch', () => {
    const fixture = createFixture()

    fixture.note.applyTopicBlockEdits({
      topicId: fixture.topicId,
      edits: [
        {
          blockId: 'child-b',
          content: [paragraph('B')],
          index: 1,
          kind: 'outline',
          operation: 'insert-block',
          parentId: 'parent',
        },
        {
          blockId: 'new-parent',
          content: [paragraph('New parent')],
          kind: 'outline',
          operation: 'insert-block',
        },
        {
          blockId: 'new-child',
          content: [paragraph('New child')],
          kind: 'outline',
          operation: 'insert-block',
          parentId: 'new-parent',
        },
        { blockId: 'tail', content: [paragraph('Updated tail')], operation: 'update-block-content' },
        { attributes: { checked: true, kind: 'task' }, blockId: 'tail', operation: 'update-block-attributes' },
        { blockId: 'tail', index: 0, operation: 'move-block', parentId: 'parent' },
      ],
    })

    const document = documentOf(fixture)
    const parent = findBlock(document, 'parent')
    expect(parent.content?.[0]?.type).toBe('paragraph')
    expect(childBlockIds(parent)).toEqual(['tail', 'child-a', 'child-b', 'child-c'])
    expect(findBlock(document, 'tail')).toMatchObject({
      attrs: { blockId: 'tail', checked: true, kind: 'task' },
      content: [{ content: [{ text: 'Updated tail', type: 'text' }], type: 'paragraph' }],
    })
    expect(childBlockIds(findBlock(document, 'new-parent'))).toEqual(['new-child'])
  })

  it('deletes subtrees and promotes children at the deleted Block position', () => {
    const promoted = createFixture()
    promoted.note.applyTopicBlockEdits({
      topicId: promoted.topicId,
      edits: [{ blockId: 'parent', operation: 'delete-block', strategy: 'promote-children' }],
    })
    expect(childBlockIds(documentOf(promoted))).toEqual(['child-a', 'child-c', 'tail'])

    const deleted = createFixture()
    deleted.note.applyTopicBlockEdits({
      topicId: deleted.topicId,
      edits: [{ blockId: 'parent', operation: 'delete-block', strategy: 'delete-subtree' }],
    })
    expect(childBlockIds(documentOf(deleted))).toEqual(['tail'])
  })

  it('rejects duplicate IDs, nested content, cycles, and invalid indexes without partial writes', () => {
    const invalidBatches = [
      [{ blockId: 'tail', content: [paragraph('Duplicate')], kind: 'outline', operation: 'insert-block' }],
      [{ blockId: 'tail', content: [block('hidden-child', 'Hidden')], operation: 'update-block-content' }],
      [{ blockId: 'parent', operation: 'move-block', parentId: 'child-a' }],
      [{ blockId: 'tail', index: 99, operation: 'move-block', parentId: 'parent' }],
      [
        { blockId: 'temporary', content: [paragraph('Temporary')], kind: 'outline', operation: 'insert-block' },
        { blockId: 'missing', operation: 'delete-block', strategy: 'delete-subtree' },
      ],
    ] as const

    for (const edits of invalidBatches) {
      const fixture = createFixture()
      const before = structuredClone(documentOf(fixture))
      expect(() => fixture.note.applyTopicBlockEdits({ edits, topicId: fixture.topicId })).toThrow()
      expect(documentOf(fixture)).toEqual(before)
    }
  })

  it('rejects an empty batch and a schema-invalid final document atomically', () => {
    const fixture = createFixture()
    const before = structuredClone(documentOf(fixture))

    expect(() => fixture.note.applyTopicBlockEdits({ edits: [], topicId: fixture.topicId })).toThrow('at least one operation')
    expect(() => fixture.note.applyTopicBlockEdits({
      topicId: fixture.topicId,
      edits: [{ blockId: 'bad-kind', content: [paragraph('Bad')], kind: '', operation: 'insert-block' }],
    })).toThrow()
    expect(documentOf(fixture)).toEqual(before)
  })
})
