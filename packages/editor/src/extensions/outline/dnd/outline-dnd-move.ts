import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import type { DropTarget } from './outline-dnd-types'
import { Fragment, Slice } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { dropPoint } from '@tiptap/pm/transform'
import {
  findFirstChildListPos,
  findListItem,
  isListContainerNode,
  isOutlineTextBlockNode,
} from '../core/outline-utils'
import { findParentListType, normalizeItemForList } from '../list/outline-list-utils'

export function hasChildList(node: ProseMirrorNode) {
  let hasChildren = false
  node.forEach((child) => {
    if (isListContainerNode(child))
      hasChildren = true
  })
  return hasChildren
}

function isEmptyListItem(node: ProseMirrorNode) {
  if (node.childCount !== 1)
    return false
  const first = node.child(0)
  return isOutlineTextBlockNode(first) && first.content.size === 0
}

export function moveOutlineItem(view: EditorView, fromPos: number, drop: DropTarget) {
  if (!drop.valid)
    return

  const { state } = view
  const sourceLookup = findListItem(state.doc.resolve(Math.min(fromPos + 1, state.doc.content.size)))
  if (!sourceLookup)
    return
  const sourcePos = sourceLookup.pos
  const fromNode = sourceLookup.node

  const fromEnd = sourcePos + fromNode.nodeSize
  if (drop.pos >= sourcePos && drop.pos < fromEnd)
    return

  let insertPos: number | null = null
  let insertNode: ProseMirrorNode | null = null
  let insertedListWrapper = false

  const $target = state.doc.resolve(drop.pos + 1)
  const targetListItem = findListItem($target)
  if (!targetListItem)
    return
  const targetNode = targetListItem.node

  const sourceListType = findParentListType(
    state.doc.resolve(Math.min(sourcePos + 1, state.doc.content.size)),
  )

  if (drop.type === 'before') {
    insertPos = targetListItem.pos
  }
  else if (drop.type === 'after') {
    insertPos = targetListItem.pos + targetNode.nodeSize
  }
  else {
    const childListPos = findFirstChildListPos(targetListItem)
    if (childListPos !== null) {
      // Insert as the first child in the existing list.
      insertPos = childListPos + 1
      const childListNode = state.doc.nodeAt(childListPos)
      const targetListType = childListNode?.type ?? sourceListType
      insertNode = normalizeItemForList(view.state.schema, targetListType ?? null, fromNode)
    }
    else {
      const listType = sourceListType
        ?? findParentListType(state.doc.resolve(drop.pos))
        ?? state.schema.nodes.bulletList
      if (!listType)
        return
      insertPos = targetListItem.pos + targetListItem.node.nodeSize - 1
      const itemForList = normalizeItemForList(view.state.schema, listType, fromNode)
      insertNode = listType.create(null, itemForList)
      insertedListWrapper = true
    }
  }

  if (insertPos === null)
    return

  const $from = state.doc.resolve(Math.min(sourcePos + 1, state.doc.content.size))
  const fromListItem = findListItem($from)
  let parentListPos: number | null = null
  let shouldRemoveParentList = false
  let insertInsideParentList = false

  if (fromListItem) {
    const listDepth = fromListItem.depth - 1
    if (listDepth > 0) {
      const listNode = $from.node(listDepth)
      if (isListContainerNode(listNode)) {
        parentListPos = $from.before(listDepth)
        // Remove empty nested list when we move its last item out.
        shouldRemoveParentList = listDepth > 1 && listNode.childCount === 1
        const parentEnd = parentListPos + listNode.nodeSize
        // Keep the parent list if we insert back inside its range.
        insertInsideParentList = insertPos > parentListPos && insertPos < parentEnd
      }
    }
  }

  const tr = state.tr
  tr.delete(sourcePos, fromEnd)

  if (shouldRemoveParentList && !insertInsideParentList && parentListPos !== null) {
    const mappedListPos = tr.mapping.map(parentListPos)
    const listNodeAfterDelete = tr.doc.nodeAt(mappedListPos)
    if (listNodeAfterDelete && isListContainerNode(listNodeAfterDelete)) {
      const shouldRemoveEmpty = listNodeAfterDelete.childCount === 0
        || (listNodeAfterDelete.childCount === 1 && isEmptyListItem(listNodeAfterDelete.child(0)))
      // Remove the empty list container to avoid leaving a blank list item behind.
      if (shouldRemoveEmpty)
        tr.delete(mappedListPos, mappedListPos + listNodeAfterDelete.nodeSize)
    }
  }

  const mappedInsertPos = tr.mapping.map(insertPos)
  const insertContent = insertNode ?? fromNode
  const slice = new Slice(Fragment.from(insertContent), 0, 0)
  // Let ProseMirror choose the nearest valid insertion point.
  const safeInsertPos = dropPoint(tr.doc, mappedInsertPos, slice)
  if (safeInsertPos === null)
    return
  tr.replaceRange(safeInsertPos, safeInsertPos, slice)

  if (drop.type === 'child' && targetNode.attrs.folded) {
    const mappedTargetPos = tr.mapping.map(drop.pos)
    tr.setNodeMarkup(mappedTargetPos, undefined, {
      ...targetNode.attrs,
      folded: false,
    })
  }

  const selectionPos = insertedListWrapper ? safeInsertPos + 2 : safeInsertPos + 1
  const safeSelectionPos = Math.min(selectionPos, tr.doc.content.size)
  tr.setSelection(TextSelection.near(tr.doc.resolve(safeSelectionPos)))
  tr.scrollIntoView()
  view.dispatch(tr)
}
