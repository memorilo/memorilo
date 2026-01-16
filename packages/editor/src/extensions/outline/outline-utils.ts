import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export interface ListItemContext {
  node: ProseMirrorNode
  depth: number
  pos: number
}

export interface ReplaceRange {
  from: number
  to: number
}

const listContainerNames = new Set(['bulletList', 'orderedList', 'taskList'])
const outlineItemNames = new Set(['listItem', 'taskItem'])
const outlineTextBlockNames = new Set(['paragraph', 'heading'])
const emptyParagraphInlineNames = new Set(['text', 'hardBreak'])

export function isListContainerNode(node: ProseMirrorNode) {
  return listContainerNames.has(node.type.name)
}

export function isOutlineItemNode(node: ProseMirrorNode) {
  return outlineItemNames.has(node.type.name)
}

export function isOutlineItemName(name: string) {
  return outlineItemNames.has(name)
}

export function isOutlineTextBlockNode(node: ProseMirrorNode) {
  return outlineTextBlockNames.has(node.type.name)
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

export function getLeadingEmptyParagraphRange(
  $pos: ResolvedPos,
): ReplaceRange | null {
  const listItem = findListItem($pos)
  if (!listItem) {
    return null
  }

  if ($pos.index(listItem.depth) !== 0) {
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
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (isOutlineItemName(node.type.name)) {
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
    if (!isOutlineItemNode(node)) return

    if (direction === 'prev') {
      found = pos
    } else {
      if (found !== null) return false
      found = pos
    }
  })

  return found
}

export function resolveOutlineItemFromElement(
  view: EditorView,
  element: HTMLElement,
) {
  let current: HTMLElement | null = element
  while (current && !current.hasAttribute('data-outline-item')) {
    current = current.parentElement
  }

  if (!current) return null
  let pos: number | null = null

  try {
    const domPos = view.posAtDOM(current, 0)
    let listItem = findListItem(view.state.doc.resolve(domPos))
    if (!listItem) {
      const nextPos = Math.min(domPos + 1, view.state.doc.content.size)
      listItem = findListItem(view.state.doc.resolve(nextPos))
    }
    if (listItem)
      pos = listItem.pos
  }
  catch {
    pos = null
  }

  if (pos === null)
    return null

  const node = view.state.doc.nodeAt(pos)
  if (!node) return null
  return { node, pos, element: current }
}
