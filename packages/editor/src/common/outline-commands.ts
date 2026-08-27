import type { NodeJSON } from 'prosekit/core'

export type OutdentBehavior = 'logical' | 'traditional'

export type OutdentBlockedReason
  = | 'empty_selection'
    | 'unknown_selected_block'
    | 'already_at_root'
    | 'crosses_focus_root'
    | 'traditional_requires_same_parent'
    | 'traditional_requires_contiguous_siblings'

export interface OutdentOptions {
  behavior: OutdentBehavior
  viewRootId?: string | null
}

export type OutdentResult
  = | {
    status: 'ready'
    document: NodeJSON
    movedBlockIds: string[]
  }
  | {
    status: 'blocked'
    reason: OutdentBlockedReason
  }

export type OutlineMoveDirection = 'down' | 'up'

export type OutlineMoveResult
  = | {
    status: 'ready'
    document: NodeJSON
    movedBlockIds: string[]
  }
  | {
    status: 'blocked'
    reason: 'empty_selection' | 'unknown_selected_block' | 'at_boundary' | 'focus_root'
  }

interface BlockContainer {
  children: OutlineBlock[]
  owner: OutlineBlock | null
}

interface OutlineBlock {
  body: NodeJSON[]
  children: OutlineBlock[]
  container: BlockContainer
  depth: number
  id: string
  node: NodeJSON
  order: number
  parent: BlockContainer
}

interface OutlineTree {
  blocks: Map<string, OutlineBlock>
  document: NodeJSON
  root: BlockContainer
}

function parseOutlineTree(document: NodeJSON): OutlineTree {
  if (document.type !== 'doc')
    throw new TypeError(`Expected a doc node, received ${document.type}`)

  const blocks = new Map<string, OutlineBlock>()
  let order = 0
  const root: BlockContainer = { children: [], owner: null }

  const readBlock = (node: NodeJSON, parent: BlockContainer, depth: number): OutlineBlock => {
    if (node.type !== 'list')
      throw new TypeError(`Expected a normalized list block, received ${node.type}`)
    const id = node.attrs?.blockId
    if (typeof id !== 'string' || id.length === 0)
      throw new Error('Outline blocks require a stable blockId')
    if (blocks.has(id))
      throw new Error(`Duplicate outline block id: ${id}`)

    const childNodes = node.content?.filter(child => child.type === 'list') ?? []
    const body = node.content?.filter(child => child.type !== 'list').map(child => structuredClone(child)) ?? []
    const container: BlockContainer = { children: [], owner: null }
    const block: OutlineBlock = {
      body,
      children: container.children,
      container,
      depth,
      id,
      node: structuredClone(node),
      order: order++,
      parent,
    }
    container.owner = block
    blocks.set(id, block)
    container.children.push(...childNodes.map(child => readBlock(child, container, depth + 1)))
    return block
  }

  const topLevel = document.content ?? []
  root.children.push(...topLevel.map(node => readBlock(node, root, 0)))

  return { blocks, document: structuredClone(document), root }
}

function serializeTree(tree: OutlineTree): NodeJSON {
  const serializeBlock = (block: OutlineBlock): NodeJSON => ({
    ...block.node,
    attrs: block.node.attrs ? { ...block.node.attrs } : undefined,
    content: [
      ...block.body.map(node => structuredClone(node)),
      ...block.children.map(serializeBlock),
    ],
  })

  return {
    ...tree.document,
    content: tree.root.children.map(serializeBlock),
  }
}

function isAncestor(ancestor: OutlineBlock, descendant: OutlineBlock): boolean {
  let owner = descendant.parent.owner
  while (owner) {
    if (owner === ancestor)
      return true
    owner = owner.parent.owner
  }
  return false
}

function topLevelSelection(selected: OutlineBlock[]): OutlineBlock[] {
  return selected.filter(candidate => !selected.some(other => other !== candidate && isAncestor(other, candidate)))
}

function blocked(reason: OutdentBlockedReason): OutdentResult {
  return { status: 'blocked', reason }
}

export function planOutdent(
  document: NodeJSON,
  selectedBlockIds: readonly string[],
  options: OutdentOptions,
): OutdentResult {
  if (selectedBlockIds.length === 0)
    return blocked('empty_selection')

  const tree = parseOutlineTree(document)
  const selected = selectedBlockIds.map(id => tree.blocks.get(id))
  if (selected.some(block => !block))
    return blocked('unknown_selected_block')

  const targets = topLevelSelection(selected as OutlineBlock[])
  if (targets.some(target => target.parent.owner === null))
    return blocked('already_at_root')
  if (options.viewRootId) {
    const viewRoot = tree.blocks.get(options.viewRootId)
    if (!viewRoot)
      return blocked('crosses_focus_root')
    if (targets.some(target => target === viewRoot || target.parent.owner === viewRoot))
      return blocked('crosses_focus_root')
  }

  const targetsInDocumentOrder = [...targets].sort((left, right) => left.order - right.order)
  let traditionalRightSiblings: OutlineBlock[] = []
  if (options.behavior === 'traditional') {
    const source = targetsInDocumentOrder[0]?.parent
    if (!source)
      return blocked('empty_selection')
    if (targetsInDocumentOrder.some(target => target.parent !== source))
      return blocked('traditional_requires_same_parent')

    const indices = targetsInDocumentOrder.map(target => source.children.indexOf(target))
    const firstIndex = indices[0]
    if (firstIndex === undefined)
      return blocked('empty_selection')
    if (indices.some((index, offset) => index !== firstIndex + offset))
      return blocked('traditional_requires_contiguous_siblings')
    const lastIndex = indices.at(-1)
    if (lastIndex === undefined)
      return blocked('empty_selection')
    traditionalRightSiblings = source.children.slice(lastIndex + 1)
  }

  const orderedTargets = [...targets].sort((left, right) => right.depth - left.depth || right.order - left.order)
  for (const target of orderedTargets) {
    const source = target.parent
    const parentBlock = source.owner
    if (!parentBlock)
      throw new Error(`Cannot outdent root block ${target.id}`)
    const destination = parentBlock.parent
    const sourceIndex = source.children.indexOf(target)
    if (sourceIndex < 0)
      throw new Error(`Block ${target.id} is missing from its parent`)
    source.children.splice(sourceIndex, 1)
    const parentIndex = destination.children.indexOf(parentBlock)
    if (parentIndex < 0)
      throw new Error(`Parent block ${parentBlock.id} is missing from its parent`)
    destination.children.splice(parentIndex + 1, 0, target)
    target.parent = destination
  }

  if (options.behavior === 'traditional' && traditionalRightSiblings.length > 0) {
    const lastTarget = targetsInDocumentOrder.at(-1)
    if (!lastTarget)
      return blocked('empty_selection')
    for (const sibling of traditionalRightSiblings) {
      const siblingIndex = sibling.parent.children.indexOf(sibling)
      if (siblingIndex < 0)
        throw new Error(`Block ${sibling.id} is missing from its parent`)
      sibling.parent.children.splice(siblingIndex, 1)
      lastTarget.children.push(sibling)
      sibling.parent = lastTarget.container
    }
  }

  return {
    status: 'ready',
    document: serializeTree(tree),
    movedBlockIds: targetsInDocumentOrder.map(target => target.id),
  }
}

/** Moves selected blocks within their current parents, preserving each subtree. */
export function planMove(
  document: NodeJSON,
  selectedBlockIds: readonly string[],
  direction: OutlineMoveDirection,
): OutlineMoveResult {
  if (selectedBlockIds.length === 0)
    return { reason: 'empty_selection', status: 'blocked' }

  const tree = parseOutlineTree(document)
  const selected = selectedBlockIds.map(id => tree.blocks.get(id))
  if (selected.some(block => !block))
    return { reason: 'unknown_selected_block', status: 'blocked' }

  const selectedSet = new Set(selectedBlockIds)
  const targets = (selected as OutlineBlock[]).filter((block) => {
    // A selected descendant moves with its selected ancestor.
    let owner = block.parent.owner
    while (owner) {
      if (selectedSet.has(owner.id))
        return false
      owner = owner.parent.owner
    }
    return true
  }).sort((left, right) => left.order - right.order)

  const moved = direction === 'up' ? [...targets] : [...targets].reverse()
  const delta = direction === 'up' ? -1 : 1
  for (const target of targets) {
    const siblings = target.parent.children
    const index = siblings.indexOf(target)
    let adjacentIndex = index + delta
    while (adjacentIndex >= 0 && adjacentIndex < siblings.length && selectedSet.has(siblings[adjacentIndex]!.id))
      adjacentIndex += delta
    if (adjacentIndex < 0 || adjacentIndex >= siblings.length)
      return { reason: 'at_boundary', status: 'blocked' }
  }

  const movedIds: string[] = []
  for (const target of moved) {
    const siblings = target.parent.children
    const index = siblings.indexOf(target)
    siblings.splice(index, 1)
    siblings.splice(index + delta, 0, target)
    movedIds.push(target.id)
  }

  if (movedIds.length === 0)
    return { reason: 'at_boundary', status: 'blocked' }
  return { document: serializeTree(tree), movedBlockIds: movedIds, status: 'ready' }
}
