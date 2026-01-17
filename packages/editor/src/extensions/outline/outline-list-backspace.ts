import type { Editor } from '@tiptap/core'
import type { ResolvedPos } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'
import {
  findListItem,
  findSiblingListItemPos,
  isEmptyOutlineParagraph,
  isListContainerNode,
  isOrderedListNode,
  isOutlineTextBlockNode,
} from './outline-utils'

function stripCheckedAttr(attrs: Record<string, any>) {
  const nextAttrs = { ...attrs }
  if ('checked' in nextAttrs) {
    delete nextAttrs.checked
  }
  return nextAttrs
}

function deleteLeadingParagraph($from: ResolvedPos, tr: Transaction) {
  const paragraphPos = $from.before($from.depth)
  return tr.delete(paragraphPos, paragraphPos + $from.parent.nodeSize)
}

export function createOutlineListBackspaceHandler(editor: Editor) {
  return () => {
    const { state, view } = editor
    if (!view)
      return false
    const { selection } = state
    if (!selection.empty)
      return false

    const { $from } = selection
    if (!isOutlineTextBlockNode($from.parent) || $from.parentOffset !== 0) {
      return false
    }

    const listItem = findListItem($from)
    if (!listItem)
      return false

    const isEmpty = isEmptyOutlineParagraph($from.parent)
    if (!isEmpty) {
      return true
    }

    const listDepth = listItem.depth - 1
    if (listDepth < 0)
      return true

    const listNode = $from.node(listDepth)
    const isTaskItem = listItem.node.type.name === 'taskItem'
    const hasLeadingBlock = listItem.node.childCount > 1
    const nextChild = hasLeadingBlock ? listItem.node.child(1) : null
    const canRemoveLeadingParagraph = Boolean(
      hasLeadingBlock && nextChild && !isListContainerNode(nextChild),
    )
    const nextListItemAttrs = stripCheckedAttr(listItem.node.attrs)

    if (isTaskItem) {
      const listItemType = state.schema.nodes.listItem
      if (!listItemType)
        return true
      let tr = state.tr.setNodeMarkup(listItem.pos, listItemType, nextListItemAttrs)
      if (canRemoveLeadingParagraph) {
        // Remove the empty paragraph when the next block can safely become the first child.
        tr = deleteLeadingParagraph($from, tr)
      }
      view.dispatch(tr.scrollIntoView())
      return true
    }
    if (canRemoveLeadingParagraph) {
      // Preserve the list item when deleting a leading empty paragraph.
      const tr = deleteLeadingParagraph($from, state.tr)
      view.dispatch(tr)
      return true
    }
    if (hasLeadingBlock) {
      // Keep the empty text block when the next node is a list container.
      return true
    }
    if (listNode.childCount <= 1) {
      if (isOrderedListNode(listNode) || listNode.type.name === 'taskList') {
        const bulletListType = state.schema.nodes.bulletList
        const listItemType = state.schema.nodes.listItem
        if (!bulletListType || !listItemType)
          return true

        const listPos = $from.before(listDepth)
        const listEnd = listPos + listNode.nodeSize
        const nextItem = listItemType.create(nextListItemAttrs, listItem.node.content)
        const nextList = bulletListType.create(listNode.attrs, nextItem)
        const tr = state.tr.replaceWith(listPos, listEnd, nextList)
        const selectionPos = tr.mapping.map(listPos) + 1
        tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos)))
        view.dispatch(tr.scrollIntoView())
      }

      if (listNode.type.name === 'bulletList') {
        const listPos = $from.before(listDepth)
        const listEnd = listPos + listNode.nodeSize
        const tr = state.tr.delete(listPos, listEnd)
        const selectionPos = Math.min(listPos, tr.doc.content.size)
        tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos)))
        view.dispatch(tr.scrollIntoView())
      }

      return true
    }

    const prevPos = findSiblingListItemPos(state, listItem, 'prev')
    const nextPos = findSiblingListItemPos(state, listItem, 'next')
    const tr = state.tr.delete(listItem.pos, listItem.pos + listItem.node.nodeSize)
    const targetPos = prevPos ?? nextPos
    if (targetPos !== null) {
      const mapped = tr.mapping.map(targetPos)
      tr.setSelection(TextSelection.near(tr.doc.resolve(mapped + 1)))
    }

    view.dispatch(tr)
    return true
  }
}
