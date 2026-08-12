import type { LoroDoc, LoroTree } from 'loro-crdt'
import type { Mark, Node as ProseMirrorNode } from 'prosemirror-model'
import type { EditorState } from 'prosemirror-state'
import type { LoroTreeNode, LoroTreeNodeMapping } from './tree-schema'
import { LoroText } from 'loro-crdt'
import {
  ATTRIBUTES_KEY,
  equalTreeValue,
  NODE_KIND,
  NODE_KIND_KEY,
  NODE_NAME_KEY,
  rememberTreeNode,
  TEXT_KEY,
  TEXT_KIND,
  treeAttributes,
  treeNodeId,
  treeText,
} from './tree-schema'

function marksToAttributes(marks: readonly Mark[]) {
  return Object.fromEntries(marks.map(mark => [mark.type.name, structuredClone(mark.attrs)]))
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

function sameParent(node: LoroTreeNode, parent: LoroTreeNode | undefined): boolean {
  return node.parent()?.id === parent?.id
}

function blockId(node: ProseMirrorNode): string | undefined {
  const value = node.attrs.blockId
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function treeBlockId(node: LoroTreeNode): string | undefined {
  const value = treeAttributes(node.data.get(ATTRIBUTES_KEY)).blockId
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function mappedTreeId(
  mapping: LoroTreeNodeMapping,
  nodeOrNodes: ProseMirrorNode | ProseMirrorNode[],
): string | undefined {
  if (Array.isArray(nodeOrNodes)) {
    const first = nodeOrNodes[0]
    if (first) {
      const weak = treeNodeId(first)
      if (weak)
        return weak
    }
  }
  else {
    const weak = treeNodeId(nodeOrNodes)
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

function updateText(text: ReturnType<typeof treeText>, nodes: readonly ProseMirrorNode[]): void {
  const currentDelta = text.toDelta()
  if (currentDelta.length === nodes.length && currentDelta.every((delta, index) => {
    const node = nodes[index]
    return node !== undefined
      && delta.insert === node.text
      && equalTreeValue(delta.attributes ?? {}, marksToAttributes(node.marks))
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
  blockIds: Map<string, LoroTreeNode>
  existingMapping: LoroTreeNodeMapping
  mapping: LoroTreeNodeMapping
  tree: LoroTree
  used: Set<string>
}

function compatible(node: LoroTreeNode, desired: ProseMirrorNode | ProseMirrorNode[]): boolean {
  if (Array.isArray(desired))
    return node.data.get(NODE_KIND_KEY) === TEXT_KIND
  return node.data.get(NODE_KIND_KEY) === NODE_KIND && node.data.get(NODE_NAME_KEY) === desired.type.name
}

function findCandidate(
  context: ReconcileContext,
  parent: LoroTreeNode | undefined,
  index: number,
  desired: ProseMirrorNode | ProseMirrorNode[],
): LoroTreeNode | undefined {
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
  parent: LoroTreeNode | undefined,
  index: number,
  desired: ProseMirrorNode | ProseMirrorNode[],
): LoroTreeNode {
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

function reconcileNode(
  context: ReconcileContext,
  parent: LoroTreeNode | undefined,
  index: number,
  desired: ProseMirrorNode | ProseMirrorNode[],
): LoroTreeNode {
  const node = findCandidate(context, parent, index, desired)
    ?? createCandidate(context, parent, index, desired)
  context.used.add(node.id)

  if (!sameParent(node, parent) || node.index() !== index)
    context.tree.move(node.id, parent?.id, index)

  if (Array.isArray(desired)) {
    const text = treeText(node)
    updateText(text, desired)
    desired.forEach(child => rememberTreeNode(child, node.id))
    context.mapping.set(node.id, [...desired])
    context.mapping.set(text.id, [...desired])
    return node
  }

  if (node.data.get(NODE_KIND_KEY) !== NODE_KIND)
    node.data.set(NODE_KIND_KEY, NODE_KIND)
  if (node.data.get(NODE_NAME_KEY) !== desired.type.name)
    node.data.set(NODE_NAME_KEY, desired.type.name)
  if (!equalTreeValue(node.data.get(ATTRIBUTES_KEY), desired.attrs))
    node.data.set(ATTRIBUTES_KEY, structuredClone(desired.attrs))
  rememberTreeNode(desired, node.id)
  context.mapping.set(node.id, desired)

  normalizeContent(desired).forEach((child, childIndex) => {
    reconcileNode(context, node, childIndex, child)
  })
  return node
}

function depth(node: LoroTreeNode): number {
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
  return treeNodeId(node)
}
