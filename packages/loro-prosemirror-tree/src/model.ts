import type {
  LoroDoc,
  LoroMap,
  LoroTree,
  Value,
} from 'loro-crdt'
import type {
  Attrs,
  Mark,
  Node as ProseMirrorNode,
  Schema,
} from 'prosemirror-model'
import type { EditorState } from 'prosemirror-state'
import { LoroText } from 'loro-crdt'

export const NODE_KIND_KEY = 'kind'
export const NODE_NAME_KEY = 'nodeName'
export const ATTRIBUTES_KEY = 'attributes'
export const TEXT_KEY = 'text'
export const NODE_KIND = 'node'
export const TEXT_KIND = 'text'

export type LoroTreeNodeMapping = Map<string, ProseMirrorNode | ProseMirrorNode[]>

export interface TreeDocumentRuntime {
  doc: LoroDoc
  mapping: LoroTreeNodeMapping
  tree: LoroTree
}

export interface NodeJSON {
  attrs?: Record<string, unknown>
  content?: NodeJSON[]
  marks?: Array<{ attrs?: Record<string, unknown>, type: string }>
  text?: string
  type: string
}

const weakNodeToTreeNode = new WeakMap<ProseMirrorNode, string>()

function readString(map: LoroMap, key: string, description: string): string {
  const value = map.get(key)
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${description} must be a non-empty string`)
  return value
}

function attrsFromValue(value: unknown): Attrs {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value instanceof Uint8Array)
    return {}
  return structuredClone(value) as Attrs
}

function equalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right))
    return true
  if (left instanceof Uint8Array && right instanceof Uint8Array)
    return left.length === right.length && left.every((value, index) => value === right[index])
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((value, index) => equalValue(value, right[index]))
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
    return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => Object.hasOwn(rightRecord, key) && equalValue(leftRecord[key], rightRecord[key]))
}

function marksToAttributes(marks: readonly Mark[]): Record<string, Attrs> {
  return Object.fromEntries(marks.map(mark => [mark.type.name, structuredClone(mark.attrs)]))
}

function jsonMarksToAttributes(marks: NodeJSON['marks']): Record<string, Value> {
  return Object.fromEntries((marks ?? []).map(mark => [mark.type, structuredClone(mark.attrs ?? {}) as Value]))
}

function attributesToMarks(schema: Schema, attributes: Record<string, unknown> | undefined) {
  return Object.entries(attributes ?? {}).map(([name, attrs]) => schema.mark(name, attrsFromValue(attrs)))
}

function normalizeContent(node: ProseMirrorNode): Array<ProseMirrorNode | ProseMirrorNode[]> {
  const content: Array<ProseMirrorNode | ProseMirrorNode[]> = []
  let textRun: ProseMirrorNode[] | undefined

  node.content.forEach((child) => {
    if (child.isText) {
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
  })

  if (content.length === 0 && node.isTextblock)
    content.push([])
  return content
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

function textFromNode(node: ReturnType<LoroTree['getNodes']>[number]): LoroText {
  const text = node.data.get(TEXT_KEY)
  if (!(text instanceof LoroText))
    throw new Error(`Tree text node ${node.id} is missing its LoroText`)
  return text
}

function textNodesFromLoro(schema: Schema, text: LoroText): ProseMirrorNode[] {
  const result: ProseMirrorNode[] = []
  for (const delta of text.toDelta()) {
    if (typeof delta.insert !== 'string' || delta.insert.length === 0)
      continue
    result.push(schema.text(delta.insert, attributesToMarks(schema, delta.attributes)))
  }
  return result
}

function textJsonFromLoro(text: LoroText): NodeJSON[] {
  const result: NodeJSON[] = []
  for (const delta of text.toDelta()) {
    if (typeof delta.insert !== 'string' || delta.insert.length === 0)
      continue
    const marks = Object.entries(delta.attributes ?? {}).map(([type, attrs]) => ({
      ...(Object.keys(attrsFromValue(attrs)).length > 0 ? { attrs: attrsFromValue(attrs) } : {}),
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
  node: ReturnType<LoroTree['getNodes']>[number],
  mapping: LoroTreeNodeMapping,
): ProseMirrorNode | ProseMirrorNode[] {
  const cached = mapping.get(node.id)
  if (cached)
    return cached

  const kind = readString(node.data, NODE_KIND_KEY, `Tree node ${node.id} kind`)
  if (kind === TEXT_KIND) {
    const text = textFromNode(node)
    const nodes = textNodesFromLoro(schema, text)
    nodes.forEach(child => weakNodeToTreeNode.set(child, node.id))
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
  const nodeName = readString(node.data, NODE_NAME_KEY, `Tree node ${node.id} nodeName`)
  const result = schema.node(nodeName, attrsFromValue(node.data.get(ATTRIBUTES_KEY)), children)
  weakNodeToTreeNode.set(result, node.id)
  mapping.set(node.id, result)
  return result
}

function jsonFromTreeNode(node: ReturnType<LoroTree['getNodes']>[number]): NodeJSON | NodeJSON[] {
  const kind = readString(node.data, NODE_KIND_KEY, `Tree node ${node.id} kind`)
  if (kind === TEXT_KIND)
    return textJsonFromLoro(textFromNode(node))
  if (kind !== NODE_KIND)
    throw new Error(`Tree node ${node.id} has unsupported kind ${kind}`)

  const content = (node.children() ?? []).flatMap((child) => {
    const value = jsonFromTreeNode(child)
    return Array.isArray(value) ? value : [value]
  })
  const attrs = attrsFromValue(node.data.get(ATTRIBUTES_KEY)) as Record<string, unknown>
  return {
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(content.length > 0 ? { content } : {}),
    type: readString(node.data, NODE_NAME_KEY, `Tree node ${node.id} nodeName`),
  }
}

export function getDocumentRoot(tree: LoroTree) {
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

function sameParent(
  node: ReturnType<LoroTree['getNodes']>[number],
  parent: ReturnType<LoroTree['getNodes']>[number] | undefined,
): boolean {
  return node.parent()?.id === parent?.id
}

function blockId(node: ProseMirrorNode): string | undefined {
  const value = node.attrs.blockId
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function treeBlockId(node: ReturnType<LoroTree['getNodes']>[number]): string | undefined {
  const value = attrsFromValue(node.data.get(ATTRIBUTES_KEY)).blockId
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function mappedTreeId(mapping: LoroTreeNodeMapping, nodeOrNodes: ProseMirrorNode | ProseMirrorNode[]): string | undefined {
  if (Array.isArray(nodeOrNodes)) {
    const first = nodeOrNodes[0]
    if (first) {
      const weak = weakNodeToTreeNode.get(first)
      if (weak)
        return weak
    }
  }
  else {
    const weak = weakNodeToTreeNode.get(nodeOrNodes)
    if (weak)
      return weak
  }

  for (const [id, mapped] of mapping) {
    if (mapped === nodeOrNodes)
      return id
    if (Array.isArray(mapped) && Array.isArray(nodeOrNodes) && mapped.some(item => nodeOrNodes.includes(item)))
      return id
  }
  return undefined
}

function updateText(text: LoroText, nodes: readonly ProseMirrorNode[]): void {
  const currentDelta = text.toDelta()
  if (currentDelta.length === nodes.length && currentDelta.every((delta, index) => {
    const node = nodes[index]
    return node !== undefined
      && delta.insert === node.text
      && equalValue(delta.attributes ?? {}, marksToAttributes(node.marks))
  })) {
    return
  }

  const oldAttributes: Record<string, null> = {}
  for (const delta of currentDelta) {
    Object.keys(delta.attributes ?? {}).forEach((key) => {
      oldAttributes[key] = null
    })
  }

  const desired = nodes.map(node => ({
    attributes: { ...oldAttributes, ...marksToAttributes(node.marks) },
    insert: node.text ?? '',
  }))
  const desiredText = desired.map(item => item.insert).join('')
  if (text.toString() !== desiredText)
    text.update(desiredText)
  if (desired.length > 0) {
    text.applyDelta(desired.map(item => ({
      attributes: item.attributes,
      retain: item.insert.length,
    })))
  }
}

interface ReconcileContext {
  blockIds: Map<string, ReturnType<LoroTree['getNodes']>[number]>
  existingMapping: LoroTreeNodeMapping
  mapping: LoroTreeNodeMapping
  tree: LoroTree
  used: Set<string>
}

function compatible(
  node: ReturnType<LoroTree['getNodes']>[number],
  desired: ProseMirrorNode | ProseMirrorNode[],
): boolean {
  if (Array.isArray(desired))
    return node.data.get(NODE_KIND_KEY) === TEXT_KIND
  return node.data.get(NODE_KIND_KEY) === NODE_KIND && node.data.get(NODE_NAME_KEY) === desired.type.name
}

function findCandidate(
  context: ReconcileContext,
  parent: ReturnType<LoroTree['getNodes']>[number] | undefined,
  index: number,
  desired: ProseMirrorNode | ProseMirrorNode[],
) {
  const mappedId = mappedTreeId(context.existingMapping, desired)
  const mapped = mappedId ? context.tree.getNodeByID(mappedId as `${number}@${number}`) : undefined
  if (mapped && !context.used.has(mapped.id) && compatible(mapped, desired))
    return mapped

  if (!Array.isArray(desired)) {
    const id = blockId(desired)
    const byBlockId = id ? context.blockIds.get(id) : undefined
    if (byBlockId && !context.used.has(byBlockId.id) && compatible(byBlockId, desired))
      return byBlockId
  }

  const positional = (parent?.children() ?? context.tree.toArray().map(item => context.tree.getNodeByID(item.id)).filter(Boolean))
    .at(index)
  if (positional && !context.used.has(positional.id) && compatible(positional, desired))
    return positional

  return (parent?.children() ?? []).find(node => !context.used.has(node.id) && compatible(node, desired))
}

function createCandidate(
  context: ReconcileContext,
  parent: ReturnType<LoroTree['getNodes']>[number] | undefined,
  index: number,
  desired: ProseMirrorNode | ProseMirrorNode[],
) {
  const node = context.tree.createNode(parent?.id, index)
  if (Array.isArray(desired)) {
    node.data.set(NODE_KIND_KEY, TEXT_KIND)
    node.data.setContainer(TEXT_KEY, new LoroText())
  }
  else {
    node.data.set(NODE_KIND_KEY, NODE_KIND)
    node.data.set(NODE_NAME_KEY, desired.type.name)
  }
  return node
}

function createJsonNode(
  tree: LoroTree,
  parent: ReturnType<LoroTree['getNodes']>[number] | undefined,
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

export function initializeLoroTreeFromJson(tree: LoroTree, document: NodeJSON): void {
  if (tree.getNodes().length !== 0)
    throw new Error('Cannot initialize a non-empty Topic tree')
  if (document.type !== 'doc')
    throw new TypeError(`Expected a doc node, received ${document.type}`)
  createJsonNode(tree, undefined, 0, document)
}

function reconcileNode(
  context: ReconcileContext,
  parent: ReturnType<LoroTree['getNodes']>[number] | undefined,
  index: number,
  desired: ProseMirrorNode | ProseMirrorNode[],
) {
  const node = findCandidate(context, parent, index, desired)
    ?? createCandidate(context, parent, index, desired)
  context.used.add(node.id)

  if (!sameParent(node, parent) || node.index() !== index)
    context.tree.move(node.id, parent?.id, index)

  if (Array.isArray(desired)) {
    const text = textFromNode(node)
    updateText(text, desired)
    desired.forEach(child => weakNodeToTreeNode.set(child, node.id))
    context.mapping.set(node.id, [...desired])
    context.mapping.set(text.id, [...desired])
    return node
  }

  if (node.data.get(NODE_KIND_KEY) !== NODE_KIND)
    node.data.set(NODE_KIND_KEY, NODE_KIND)
  if (node.data.get(NODE_NAME_KEY) !== desired.type.name)
    node.data.set(NODE_NAME_KEY, desired.type.name)
  if (!equalValue(node.data.get(ATTRIBUTES_KEY), desired.attrs))
    node.data.set(ATTRIBUTES_KEY, structuredClone(desired.attrs))
  weakNodeToTreeNode.set(desired, node.id)
  context.mapping.set(node.id, desired)

  normalizeContent(desired).forEach((child, childIndex) => {
    reconcileNode(context, node, childIndex, child)
  })
  return node
}

function depth(node: ReturnType<LoroTree['getNodes']>[number]): number {
  let value = 0
  let parent = node.parent()
  while (parent) {
    value += 1
    parent = parent.parent()
  }
  return value
}

export function updateLoroTreeFromPmState(
  doc: LoroDoc,
  tree: LoroTree,
  mapping: LoroTreeNodeMapping,
  editorState: EditorState,
): void {
  const existing = tree.getNodes()
  const context: ReconcileContext = {
    blockIds: new Map(existing.flatMap((node) => {
      const id = treeBlockId(node)
      return id ? [[id, node] as const] : []
    })),
    existingMapping: new Map(mapping),
    mapping: new Map(),
    tree,
    used: new Set(),
  }

  const wasEmpty = existing.length === 0
  reconcileNode(context, undefined, 0, editorState.doc)

  tree.getNodes()
    .filter(node => !context.used.has(node.id))
    .sort((left, right) => depth(right) - depth(left))
    .forEach(node => tree.delete(node.id))

  mapping.clear()
  context.mapping.forEach((value, key) => mapping.set(key, value))
  doc.commit({ origin: wasEmpty ? 'sys:init' : 'loroTreeSyncPlugin' })
}

export function clearTreeMapping(mapping: LoroTreeNodeMapping): void {
  mapping.clear()
}

export function getTreeNodeIdForProseMirrorNode(node: ProseMirrorNode): string | undefined {
  return weakNodeToTreeNode.get(node)
}
