import type { NodeJSON } from 'prosekit/core'

export const OUTLINE_LIST_KIND = 'outline'

export type CreateBlockId = () => string

function defaultCreateBlockId(): string {
  return crypto.randomUUID()
}

function registerBlockId(blockId: string, blockIds: Set<string>): void {
  if (blockId.length === 0)
    throw new Error('Outline block ids must be non-empty strings')
  if (blockIds.has(blockId))
    throw new Error(`Duplicate outline block id: ${blockId}`)
  blockIds.add(blockId)
}

function normalizeListNode(node: NodeJSON, createId: CreateBlockId, blockIds: Set<string>): NodeJSON {
  const attrs = node.attrs ? { ...node.attrs } : {}
  const blockId = typeof attrs.blockId === 'string' && attrs.blockId.length > 0
    ? attrs.blockId
    : createId()
  registerBlockId(blockId, blockIds)
  const content = node.content?.map(child => child.type === 'list'
    ? normalizeListNode(child, createId, blockIds)
    : structuredClone(child))

  return {
    ...node,
    attrs: {
      checked: false,
      collapsed: false,
      kind: 'bullet',
      order: null,
      ...attrs,
      blockId,
    },
    ...(content ? { content } : {}),
  }
}

export function normalizeOutlineDocument(
  document: NodeJSON,
  createId: CreateBlockId = defaultCreateBlockId,
): NodeJSON {
  if (document.type !== 'doc')
    throw new TypeError(`Expected a doc node, received ${document.type}`)

  const blockIds = new Set<string>()
  const content = document.content?.map((node) => {
    if (node.type === 'list')
      return normalizeListNode(node, createId, blockIds)

    const blockId = createId()
    registerBlockId(blockId, blockIds)

    return {
      type: 'list',
      attrs: {
        blockId,
        checked: false,
        collapsed: false,
        kind: OUTLINE_LIST_KIND,
        order: null,
      },
      content: [structuredClone(node)],
    }
  })

  return {
    ...document,
    ...(content ? { content } : {}),
  }
}
