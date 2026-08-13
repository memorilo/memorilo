import type { LoroDoc, LoroMap, LoroTree } from 'loro-crdt'
import type { Attrs, Node as ProseMirrorNode } from 'prosemirror-model'
import { LoroText } from 'loro-crdt'

export const NODE_KIND_KEY = 'kind'
export const NODE_NAME_KEY = 'nodeName'
export const ATTRIBUTES_KEY = 'attributes'
export const TEXT_KEY = 'text'
export const NODE_KIND = 'node'
export const TEXT_KIND = 'text'

export type LoroTreeNode = ReturnType<LoroTree['getNodes']>[number]
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

export function rememberTreeNode(node: ProseMirrorNode, treeNodeId: string): void {
  weakNodeToTreeNode.set(node, treeNodeId)
}

export function treeNodeId(node: ProseMirrorNode): string | undefined {
  return weakNodeToTreeNode.get(node)
}

export function readTreeString(map: LoroMap, key: string, description: string): string {
  const value = map.get(key)
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${description} must be a non-empty string`)
  return value
}

export function treeAttributes(value: unknown): Attrs {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || value instanceof Uint8Array)
    return {}
  return structuredClone(value) as Attrs
}

export function equalTreeValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right))
    return true
  if (left instanceof Uint8Array && right instanceof Uint8Array)
    return left.length === right.length && left.every((value, index) => value === right[index])
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((value, index) => equalTreeValue(value, right[index]))
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object')
    return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => Object.hasOwn(rightRecord, key) && equalTreeValue(leftRecord[key], rightRecord[key]))
}

export function treeText(node: LoroTreeNode): LoroText {
  const text = node.data.get(TEXT_KEY)
  if (!(text instanceof LoroText))
    throw new Error(`Tree text node ${node.id} is missing its LoroText`)
  return text
}
