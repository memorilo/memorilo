import type { LoroTree, Value } from 'loro-crdt'
import type { Mark, Node as ProseMirrorNode, Schema } from 'prosemirror-model'
import type {
  LoroTreeNode,
  LoroTreeNodeMapping,
  NodeJSON,
} from './tree-schema'
import { LoroText } from 'loro-crdt'
import {
  ATTRIBUTES_KEY,
  NODE_KIND,
  NODE_KIND_KEY,
  NODE_NAME_KEY,
  readTreeString,
  rememberTreeNode,
  TEXT_KEY,
  TEXT_KIND,
  treeAttributes,
  treeText,
} from './tree-schema'

function jsonMarksToAttributes(marks: NodeJSON['marks']): Record<string, Value> {
  return Object.fromEntries((marks ?? []).map(mark => [mark.type, structuredClone(mark.attrs ?? {}) as Value]))
}

function attributesToMarks(schema: Schema, attributes: Record<string, unknown> | undefined): Mark[] {
  return Object.entries(attributes ?? {}).map(([name, attrs]) => schema.mark(name, treeAttributes(attrs)))
}

function normalizeJsonContent(node: NodeJSON): Array<NodeJSON | NodeJSON[]> {
  const content: Array<NodeJSON | NodeJSON[]> = []
  let textRun: NodeJSON[] | undefined

  for (const child of node.content ?? []) {
    if (child.type === 'text') {
      if (!textRun) {
        textRun = []
        content.push(textRun)
      }
      textRun.push(child)
    }
    else {
      textRun = undefined
      content.push(child)
    }
  }

  if (content.length === 0 && ['paragraph', 'heading', 'codeBlock'].includes(node.type))
    content.push([])
  return content
}

function textNodesFromLoro(schema: Schema, node: LoroTreeNode): ProseMirrorNode[] {
  const result: ProseMirrorNode[] = []
  const text = treeText(node)
  for (const delta of text.toDelta()) {
    if (typeof delta.insert !== 'string' || delta.insert.length === 0)
      continue
    const child = schema.text(delta.insert, attributesToMarks(schema, delta.attributes))
    rememberTreeNode(child, node.id)
    result.push(child)
  }
  return result
}

function textJsonFromLoro(node: LoroTreeNode): NodeJSON[] {
  const result: NodeJSON[] = []
  for (const delta of treeText(node).toDelta()) {
    if (typeof delta.insert !== 'string' || delta.insert.length === 0)
      continue
    const marks = Object.entries(delta.attributes ?? {}).map(([type, attrs]) => ({
      ...(Object.keys(treeAttributes(attrs)).length > 0 ? { attrs: treeAttributes(attrs) } : {}),
      type,
    }))
    result.push({
      ...(marks.length > 0 ? { marks } : {}),
      text: delta.insert,
      type: 'text',
    })
  }
  return result
}

function nodeFromTree(
  schema: Schema,
  node: LoroTreeNode,
  mapping: LoroTreeNodeMapping,
): ProseMirrorNode | ProseMirrorNode[] {
  const cached = mapping.get(node.id)
  if (cached)
    return cached

  const kind = readTreeString(node.data, NODE_KIND_KEY, `Tree node ${node.id} kind`)
  if (kind === TEXT_KIND) {
    const text = treeText(node)
    const nodes = textNodesFromLoro(schema, node)
    mapping.set(node.id, nodes)
    mapping.set(text.id, nodes)
    return nodes
  }
  if (kind !== NODE_KIND)
    throw new Error(`Tree node ${node.id} has unsupported kind ${kind}`)

  const children = (node.children() ?? []).flatMap((child) => {
    const value = nodeFromTree(schema, child, mapping)
    return Array.isArray(value) ? value : [value]
  })
  const nodeName = readTreeString(node.data, NODE_NAME_KEY, `Tree node ${node.id} nodeName`)
  const result = schema.node(nodeName, treeAttributes(node.data.get(ATTRIBUTES_KEY)), children)
  rememberTreeNode(result, node.id)
  mapping.set(node.id, result)
  return result
}

function jsonFromTreeNode(node: LoroTreeNode): NodeJSON | NodeJSON[] {
  const kind = readTreeString(node.data, NODE_KIND_KEY, `Tree node ${node.id} kind`)
  if (kind === TEXT_KIND)
    return textJsonFromLoro(node)
  if (kind !== NODE_KIND)
    throw new Error(`Tree node ${node.id} has unsupported kind ${kind}`)

  const content = (node.children() ?? []).flatMap((child) => {
    const value = jsonFromTreeNode(child)
    return Array.isArray(value) ? value : [value]
  })
  const attrs = treeAttributes(node.data.get(ATTRIBUTES_KEY)) as Record<string, unknown>
  return {
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(content.length > 0 ? { content } : {}),
    type: readTreeString(node.data, NODE_NAME_KEY, `Tree node ${node.id} nodeName`),
  }
}

function createJsonNode(
  tree: LoroTree,
  parent: LoroTreeNode | undefined,
  index: number,
  value: NodeJSON | NodeJSON[],
): void {
  const node = tree.createNode(parent?.id, index)
  if (Array.isArray(value)) {
    node.data.set(NODE_KIND_KEY, TEXT_KIND)
    const text = node.data.setContainer(TEXT_KEY, new LoroText())
    const delta = value.map((child) => {
      if (typeof child.text !== 'string' || child.text.length === 0)
        throw new TypeError('A Topic text run must contain non-empty text nodes')
      return {
        attributes: jsonMarksToAttributes(child.marks),
        insert: child.text,
      }
    })
    if (delta.length > 0)
      text.applyDelta(delta)
    return
  }

  node.data.set(NODE_KIND_KEY, NODE_KIND)
  node.data.set(NODE_NAME_KEY, value.type)
  node.data.set(ATTRIBUTES_KEY, structuredClone(value.attrs ?? {}))
  normalizeJsonContent(value).forEach((child, childIndex) => {
    createJsonNode(tree, node, childIndex, child)
  })
}

export function getDocumentRoot(tree: LoroTree): LoroTreeNode | undefined {
  const roots = tree.toArray()
  if (roots.length === 0)
    return undefined
  if (roots.length !== 1)
    throw new Error(`A Topic tree must contain exactly one document root, received ${roots.length}`)
  return tree.getNodeByID(roots[0]!.id)
}

export function createNodeFromLoroTree(
  schema: Schema,
  tree: LoroTree,
  mapping: LoroTreeNodeMapping = new Map(),
): ProseMirrorNode {
  const root = getDocumentRoot(tree)
  if (!root)
    throw new Error('Cannot create a ProseMirror document from an empty Topic tree')
  const result = nodeFromTree(schema, root, mapping)
  if (Array.isArray(result))
    throw new Error('The Topic tree root must be a ProseMirror node')
  return result
}

export function createNodeJsonFromLoroTree(tree: LoroTree): NodeJSON | undefined {
  const root = getDocumentRoot(tree)
  if (!root)
    return undefined
  const result = jsonFromTreeNode(root)
  if (Array.isArray(result))
    throw new Error('The Topic tree root must be a document node')
  return result
}

export function initializeLoroTreeFromJson(tree: LoroTree, document: NodeJSON): void {
  if (tree.getNodes().length !== 0)
    throw new Error('Cannot initialize a non-empty Topic tree')
  if (document.type !== 'doc')
    throw new TypeError(`Expected a doc node, received ${document.type}`)
  createJsonNode(tree, undefined, 0, document)
}
