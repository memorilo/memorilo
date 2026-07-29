import type { MarkSpec, NodeSpec } from 'prosemirror-model'
import type { NodeJSON } from './model'
import { LoroDoc, LoroText } from 'loro-crdt'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it, vi } from 'vitest'
import {
  ATTRIBUTES_KEY,
  clearTreeMapping,
  createNodeFromLoroTree,
  createNodeJsonFromLoroTree,
  NODE_KIND,
  NODE_KIND_KEY,
  NODE_NAME_KEY,
  TEXT_KEY,
  TEXT_KIND,
  updateLoroTreeFromPmState,
} from './model'

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block*' },
  noteTitle: { attrs: { emoji: { default: '' } }, content: 'text*', group: 'block' },
  paragraph: { content: 'inline*', group: 'block' },
  bulletList: { content: 'listItem+', group: 'block' },
  listItem: { content: 'paragraph block*' },
  text: { group: 'inline' },
}
const marks: Record<string, MarkSpec> = { bold: {}, italic: {} }
const schema = new Schema({ marks, nodes })

function createEditorState(content: NodeJSON): EditorState {
  return EditorState.create({ doc: schema.nodeFromJSON(content), schema })
}

function sync(doc: LoroDoc, content: NodeJSON, mapping = new Map()) {
  const tree = doc.getTree('blocks')
  updateLoroTreeFromPmState(doc, tree, mapping, createEditorState(content))
  return { mapping, tree }
}

const exampleDocument: NodeJSON = {
  type: 'doc',
  content: [
    { type: 'noteTitle', attrs: { emoji: '🦜' }, content: [{ type: 'text', text: 'Test note' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Second paragraph ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'with bold' },
        { type: 'text', text: ' text' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet 1' }] }] },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Bullet 2 ' },
                { type: 'text', marks: [{ type: 'bold' }], text: 'with bold' },
                { type: 'text', text: ' text' },
              ],
            },
            {
              type: 'bulletList',
              content: [{
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Sub Bullet' }] },
                  {
                    type: 'bulletList',
                    content: [{
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inner bulllet' }] }],
                    }],
                  },
                ],
              }],
            },
          ],
        },
      ],
    },
  ],
}

function appendNode(
  tree: ReturnType<LoroDoc['getTree']>,
  parent: ReturnType<ReturnType<LoroDoc['getTree']>['createNode']> | undefined,
  nodeName: string,
) {
  const node = tree.createNode(parent?.id)
  node.data.set(NODE_KIND_KEY, NODE_KIND)
  node.data.set(NODE_NAME_KEY, nodeName)
  node.data.set(ATTRIBUTES_KEY, {})
  return node
}

function appendText(
  tree: ReturnType<LoroDoc['getTree']>,
  parent: ReturnType<ReturnType<LoroDoc['getTree']>['createNode']>,
  value: string,
) {
  const node = tree.createNode(parent.id)
  node.data.set(NODE_KIND_KEY, TEXT_KIND)
  const text = node.data.setContainer(TEXT_KEY, new LoroText())
  text.insert(0, value)
  return text
}

describe('updateDoc', () => {
  it('empty doc gets populated correctly', () => {
    const doc = new LoroDoc()
    const { tree } = sync(doc, exampleDocument)
    expect(createNodeJsonFromLoroTree(tree)).toEqual(exampleDocument)
    expect(tree.toArray()).toHaveLength(1)
  })

  it('doc syncs changes correctly', () => {
    const doc = new LoroDoc()
    const mapping = new Map()
    const content: NodeJSON = { type: 'doc', content: [] }
    const { tree } = sync(doc, content, mapping)
    expect(createNodeJsonFromLoroTree(tree)).toEqual({ type: 'doc' })

    content.content!.push({ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] })
    updateLoroTreeFromPmState(doc, tree, mapping, createEditorState(content))
    content.content!.push({ type: 'paragraph', content: [{ type: 'text', text: 'Hello world 2' }] })
    updateLoroTreeFromPmState(doc, tree, mapping, createEditorState(content))
    content.content!.unshift({
      type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet 1' }] }] }],
    })
    updateLoroTreeFromPmState(doc, tree, mapping, createEditorState(content))

    content.content!.splice(1, 1)
    content.content![0]!.content!.push({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet 2' }] }],
    })
    content.content![1]!.content!.push({ type: 'text', marks: [{ type: 'bold' }], text: ' with bold text' })
    updateLoroTreeFromPmState(doc, tree, mapping, createEditorState(content))

    expect(createNodeJsonFromLoroTree(tree)).toEqual(content)
  })
})

describe('createNodeFromLoroObj', () => {
  it('node gets created from doc correctly', () => {
    const doc = new LoroDoc()
    const { mapping, tree } = sync(doc, exampleDocument)
    clearTreeMapping(mapping)
    expect(createNodeFromLoroTree(schema, tree, mapping).toJSON()).toEqual(exampleDocument)
  })

  it('node syncs changes correctly', async () => {
    const doc = new LoroDoc()
    const tree = doc.getTree('blocks')
    const mapping = new Map()
    tree.subscribe(() => clearTreeMapping(mapping))
    const root = appendNode(tree, undefined, 'doc')
    doc.commit()

    expect(createNodeFromLoroTree(schema, tree, mapping).toJSON()).toEqual({ type: 'doc' })

    const first = appendNode(tree, root, 'paragraph')
    const firstText = appendText(tree, first, 'Hello world!')
    doc.commit()
    await new Promise(resolve => setTimeout(resolve))
    expect(createNodeFromLoroTree(schema, tree, mapping).toJSON()).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world!' }] }],
    })

    firstText.mark({ start: 6, end: 11 }, 'bold', true)
    doc.commit()
    await new Promise(resolve => setTimeout(resolve))
    expect(createNodeFromLoroTree(schema, tree, mapping).toJSON()).toEqual({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', marks: [{ type: 'bold' }], text: 'world' },
          { type: 'text', text: '!' },
        ],
      }],
    })

    const second = appendNode(tree, root, 'paragraph')
    appendText(tree, second, 'Second paragraph')
    const list = appendNode(tree, root, 'bulletList')
    for (const label of ['Bullet 1', 'Bullet 2']) {
      const item = appendNode(tree, list, 'listItem')
      const paragraph = appendNode(tree, item, 'paragraph')
      appendText(tree, paragraph, label)
    }
    doc.commit()
    await new Promise(resolve => setTimeout(resolve))
    expect(createNodeFromLoroTree(schema, tree, mapping).toJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'world' },
            { type: 'text', text: '!' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bullet 2' }] }] },
          ],
        },
      ],
    })
  })
})

describe('native LoroTree moves', () => {
  it('reorders a node without changing its tree id', () => {
    const doc = new LoroDoc()
    const tree = doc.getTree('blocks')
    const mapping = new Map()
    const firstState = createEditorState({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    })
    updateLoroTreeFromPmState(doc, tree, mapping, firstState)
    const root = tree.getNodes().find(node => node.parent() === undefined)!
    const firstId = root.children()![0]!.id
    const secondId = root.children()![1]!.id
    const move = vi.spyOn(tree, 'move')
    const reordered = schema.node('doc', null, [firstState.doc.child(1), firstState.doc.child(0)])
    updateLoroTreeFromPmState(doc, tree, mapping, EditorState.create({ doc: reordered, schema }))

    expect(root.children()![1]!.id).toBe(firstId)
    expect(root.children()![0]!.id).toBe(secondId)
    expect(move).toHaveBeenCalledWith(secondId, root.id, 0)
  })

  it('reparents a subtree and converges on another peer', () => {
    const source = new LoroDoc()
    const tree = source.getTree('blocks')
    const mapping = new Map()
    const initial = createEditorState({
      type: 'doc',
      content: [{
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
              { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }] }] },
            ],
          },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
        ],
      }],
    })
    updateLoroTreeFromPmState(source, tree, mapping, initial)
    const documentRoot = tree.getNodes().find(node => node.parent() === undefined)!
    const listNode = documentRoot.children()![0]!
    const firstItem = listNode.children()![0]!
    const secondItem = listNode.children()![1]!
    const nestedId = firstItem.children()![1]!.id
    const snapshot = source.export({ mode: 'snapshot' })
    const move = vi.spyOn(tree, 'move')

    const list = initial.doc.child(0)
    const oldFirst = list.child(0)
    const oldSecond = list.child(1)
    const movedNested = oldFirst.child(1)
    const newFirst = schema.node('listItem', null, [oldFirst.child(0)])
    const newSecond = schema.node('listItem', null, [oldSecond.child(0), movedNested])
    const moved = schema.node('doc', null, [schema.node('bulletList', null, [newFirst, newSecond])])
    updateLoroTreeFromPmState(source, tree, mapping, EditorState.create({ doc: moved, schema }))

    expect(secondItem.children()![1]!.id).toBe(nestedId)
    expect(move).toHaveBeenCalledWith(nestedId, secondItem.id, 1)

    const peer = new LoroDoc()
    peer.import(snapshot)
    peer.import(source.export({ mode: 'update' }))
    expect(createNodeJsonFromLoroTree(peer.getTree('blocks'))).toEqual(moved.toJSON())
  })
})
