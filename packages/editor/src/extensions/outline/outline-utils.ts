import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'

export interface ListItemContext {
  node: ProseMirrorNode
  depth: number
  pos: number
}

const listContainerNames = new Set(['bulletList', 'orderedList'])

export function isListContainerNode(node: ProseMirrorNode) {
  return listContainerNames.has(node.type.name)
}

export function getOutlineLevel($pos: ResolvedPos) {
  let level = 0
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (isListContainerNode($pos.node(depth))) {
      level += 1
    }
  }

  return level || 1
}

export function findListItem($pos: ResolvedPos): ListItemContext | null {
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (node.type.name === 'listItem') {
      return {
        node,
        depth,
        pos: $pos.before(depth),
      }
    }
  }

  return null
}

export function findFirstChildListPos(listItem: ListItemContext) {
  let childListPos: number | null = null

  listItem.node.forEach((child, offset) => {
    if (childListPos !== null) return
    if (!isListContainerNode(child)) return
    childListPos = listItem.pos + 1 + offset
  })

  return childListPos
}

export function findSiblingListItemPos(
  state: EditorState,
  listItem: ListItemContext,
  direction: 'prev' | 'next',
) {
  const { doc } = state
  const from = direction === 'prev' ? 0 : listItem.pos + listItem.node.nodeSize
  const to = direction === 'prev' ? listItem.pos : doc.content.size

  let found: number | null = null
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'listItem') return

    if (direction === 'prev') {
      found = pos
    } else {
      if (found !== null) return false
      found = pos
    }
  })

  return found
}
