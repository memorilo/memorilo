import type { NodeJSON } from 'prosekit/core'

/** Structural edits accepted by the Note block-edit transaction. */
export type TopicBlockEdit
  = | {
    attributes?: Readonly<Record<string, unknown>>
    blockId?: string
    content: readonly NodeJSON[]
    index?: number
    kind: string
    operation: 'insert-block'
    parentId?: string | null
  }
  | {
    blockId: string
    content: readonly NodeJSON[]
    operation: 'update-block-content'
  }
  | {
    attributes: Readonly<Record<string, unknown>>
    blockId: string
    operation: 'update-block-attributes'
  }
  | {
    blockId: string
    index?: number
    operation: 'move-block'
    parentId?: string | null
  }
  | {
    blockId: string
    operation: 'delete-block'
    strategy: 'delete-subtree' | 'promote-children'
  }

/**
 * Applies a batch to a detached document copy. The caller owns validation and
 * publication into its CRDT tree, so failures cannot partially mutate state.
 */
export function applyTopicBlockEdits(document: NodeJSON, edits: readonly TopicBlockEdit[]): NodeJSON {
  const next = structuredClone(document)

  const childrenOf = (node: NodeJSON): NodeJSON[] => {
    node.content ??= []
    return node.content
  }
  const blockChildren = (node: NodeJSON): NodeJSON[] => childrenOf(node).filter(child => child.type === 'list')
  const find = (blockId: string): { block: NodeJSON, index: number, siblings: NodeJSON[] } => {
    const visit = (siblings: NodeJSON[]): { block: NodeJSON, index: number, siblings: NodeJSON[] } | undefined => {
      for (const [index, block] of siblings.entries()) {
        if (block.type !== 'list')
          continue
        if (block.attrs?.blockId === blockId)
          return { block, index, siblings }
        const nested = visit(childrenOf(block))
        if (nested)
          return nested
      }
    }
    const result = visit(childrenOf(next))
    if (!result)
      throw new Error(`Unknown Topic Block: ${blockId}`)
    return result
  }
  const destination = (parentId: string | null | undefined): NodeJSON[] => parentId == null
    ? childrenOf(next)
    : childrenOf(find(parentId).block)
  const insertionIndex = (index: number | undefined, siblings: readonly NodeJSON[]): number => {
    const blockIndexes = siblings.flatMap((node, nodeIndex) => node.type === 'list' ? [nodeIndex] : [])
    const blockIndex = index ?? blockIndexes.length
    if (!Number.isSafeInteger(blockIndex) || blockIndex < 0 || blockIndex > blockIndexes.length)
      throw new RangeError(`Topic Block index must be between 0 and ${blockIndexes.length}`)
    return blockIndexes[blockIndex] ?? siblings.length
  }
  const assertBlockBody = (content: readonly NodeJSON[]): void => {
    if (content.some(node => node.type === 'list'))
      throw new TypeError('Topic Block content must not contain direct child Blocks; use structural Block edits instead')
  }
  const hasDescendant = (block: NodeJSON, blockId: string): boolean => blockChildren(block)
    .some(child => child.attrs?.blockId === blockId || hasDescendant(child, blockId))
  const containsBlock = (nodes: readonly NodeJSON[], blockId: string): boolean => nodes
    .some(node => node.attrs?.blockId === blockId || containsBlock(node.content ?? [], blockId))

  for (const edit of edits) {
    switch (edit.operation) {
      case 'insert-block': {
        assertBlockBody(edit.content)
        if (edit.blockId !== undefined && containsBlock(next.content ?? [], edit.blockId))
          throw new TypeError(`Topic Block ${edit.blockId} already exists`)
        const siblings = destination(edit.parentId)
        const blockId = edit.blockId ?? crypto.randomUUID()
        siblings.splice(insertionIndex(edit.index, siblings), 0, {
          attrs: { ...structuredClone(edit.attributes ?? {}), blockId, kind: edit.kind },
          content: structuredClone([...edit.content]),
          type: 'list',
        })
        break
      }
      case 'update-block-content': {
        assertBlockBody(edit.content)
        const { block } = find(edit.blockId)
        block.content = [...structuredClone([...edit.content]), ...blockChildren(block)]
        break
      }
      case 'update-block-attributes': {
        const { block } = find(edit.blockId)
        block.attrs = {
          ...structuredClone(edit.attributes),
          blockId: edit.blockId,
          kind: edit.attributes.kind ?? block.attrs?.kind,
        }
        break
      }
      case 'move-block': {
        const source = find(edit.blockId)
        if (edit.parentId === edit.blockId || (edit.parentId && hasDescendant(source.block, edit.parentId)))
          throw new TypeError(`Topic Block ${edit.blockId} cannot be moved into itself or its descendant`)
        source.siblings.splice(source.index, 1)
        const siblings = destination(edit.parentId)
        siblings.splice(insertionIndex(edit.index, siblings), 0, source.block)
        break
      }
      case 'delete-block': {
        const source = find(edit.blockId)
        if (edit.strategy === 'promote-children')
          source.siblings.splice(source.index, 1, ...blockChildren(source.block))
        else if (edit.strategy === 'delete-subtree')
          source.siblings.splice(source.index, 1)
        else
          throw new TypeError(`Unknown Topic Block deletion strategy: ${String(edit.strategy)}`)
        break
      }
    }
  }
  return next
}
