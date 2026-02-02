import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { TextSelection } from '@tiptap/pm/state'

export interface ListItemContext {
  node: ProseMirrorNode
  depth: number
  pos: number
}

const listContainerNames = new Set(['bulletList', 'orderedList', 'taskList'])
const outlineItemNames = new Set(['listItem', 'taskItem', 'orderedItem'])
const outlineTextBlockNames = new Set(['paragraph', 'heading'])
const emptyParagraphInlineNames = new Set(['text', 'hardBreak'])
const tableNodeNames = new Set(['table', 'tableRow', 'tableCell', 'tableHeader'])
const outlineMediaNodeNames = new Set(['image', 'blockMath'])

export function isListContainerNode(node: ProseMirrorNode) {
  return listContainerNames.has(node.type.name)
}

export function isOutlineItemNode(node: ProseMirrorNode) {
  return outlineItemNames.has(node.type.name)
}

export function isOutlineItemName(name: string) {
  return outlineItemNames.has(name)
}

export function isOrderedItemNode(node: ProseMirrorNode) {
  return node.type.name === 'orderedItem'
}

export function isOrderedListNode(node: ProseMirrorNode) {
  return node.type.name === 'orderedList'
}

export function isOutlineTextBlockNode(node: ProseMirrorNode) {
  return outlineTextBlockNames.has(node.type.name)
}

export function isSelectionInTable($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (tableNodeNames.has($pos.node(depth).type.name)) {
      return true
    }
  }

  return false
}

export function isImeComposing(
  view?: { composing?: boolean } | null,
  event?: { isComposing?: boolean, key?: string, keyCode?: number, which?: number } | null,
) {
  // IME keydowns often use keyCode 229 before compositionstart; treat as composing.
  const keyCode = event?.keyCode ?? event?.which
  return Boolean(
    view?.composing
    || event?.isComposing
    || event?.key === 'Process'
    || event?.key === 'Unidentified'
    || keyCode === 229,
  )
}

export function isOutlineMediaNode(node: ProseMirrorNode) {
  if (node.type.name === 'table') {
    return true
  }
  return outlineMediaNodeNames.has(node.type.name)
}

export function getOutlineItemSelection(state: EditorState, listItemPos: number) {
  const listItemNode = state.doc.nodeAt(listItemPos)
  if (!listItemNode) {
    return null
  }

  let selectionPos: number | null = null
  listItemNode.forEach((child, offset) => {
    if (selectionPos !== null) {
      return
    }
    if (isOutlineTextBlockNode(child)) {
      selectionPos = listItemPos + 1 + offset + 1
    }
  })

  if (selectionPos === null) {
    return TextSelection.near(state.doc.resolve(listItemPos + 1), 1)
  }

  return TextSelection.create(state.doc, selectionPos)
}

export function getOutlineItemEndSelection(state: EditorState, listItemPos: number) {
  const listItemNode = state.doc.nodeAt(listItemPos)
  if (!listItemNode) {
    return null
  }

  let selectionPos: number | null = null
  listItemNode.forEach((child, offset) => {
    if (isListContainerNode(child)) {
      return false
    }

    if (isOutlineTextBlockNode(child)) {
      selectionPos = listItemPos + 1 + offset + child.nodeSize - 1
    }

    return true
  })

  if (selectionPos === null) {
    return TextSelection.near(state.doc.resolve(listItemPos + 1), 1)
  }

  return TextSelection.near(state.doc.resolve(selectionPos), -1)
}

export function findAdjacentVisibleOutlineItemPos(
  state: EditorState,
  listItemPos: number,
  direction: -1 | 1,
) {
  const positions: number[] = []
  state.doc.descendants((node, pos) => {
    if (!isOutlineItemNode(node)) {
      return true
    }
    positions.push(pos)
    if (node.attrs?.folded === true) {
      return false
    }
    return true
  })

  const index = positions.indexOf(listItemPos)
  if (index < 0) {
    return null
  }

  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= positions.length) {
    return null
  }

  return positions[targetIndex] ?? null
}

export function isEmptyOutlineParagraph(node: ProseMirrorNode) {
  if (node.type.name !== 'paragraph') {
    return false
  }

  if (node.content.size === 0) {
    return true
  }

  if (node.textContent.trim().length > 0) {
    return false
  }

  let onlyEmptyInline = true
  node.forEach((child) => {
    if (!emptyParagraphInlineNames.has(child.type.name)) {
      onlyEmptyInline = false
    }
  })

  return onlyEmptyInline
}

export function getLeadingEmptyParagraphRange($pos: ResolvedPos) {
  const listItem = findListItem($pos)
  if (!listItem) {
    return null
  }

  if ($pos.index(listItem.depth) !== 0) {
    return null
  }

  if (listItem.node.childCount === 0) {
    return null
  }

  const firstChild = listItem.node.child(0)
  if (!isEmptyOutlineParagraph(firstChild)) {
    return null
  }

  const from = listItem.pos + 1
  return { from, to: from + firstChild.nodeSize }
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
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const node = $pos.node(depth)
    if (isOutlineItemName(node.type.name)) {
      return {
        node,
        depth,
        pos: depth === 0 ? 0 : $pos.before(depth),
      }
    }
  }

  return null
}

export function getOutlineRootItem(doc: ProseMirrorNode) {
  if (isOutlineItemNode(doc)) {
    return doc
  }
  const firstChild = doc.firstChild
  if (firstChild && isOutlineItemNode(firstChild)) {
    return firstChild
  }
  return null
}

export function findFirstChildListPos(listItem: ListItemContext) {
  let childListPos: number | null = null

  listItem.node.forEach((child, offset) => {
    if (childListPos !== null)
      return
    if (!isListContainerNode(child))
      return
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
  const to = direction === 'prev' ? Math.max(listItem.pos - 1, 0) : doc.content.size
  if (from >= to) {
    return null
  }

  let found: number | null = null
  doc.nodesBetween(from, to, (node, pos) => {
    if (!isOutlineItemNode(node))
      return

    if (direction === 'prev') {
      found = pos
    }
    else {
      if (found !== null)
        return false
      found = pos
    }
  })

  return found
}
