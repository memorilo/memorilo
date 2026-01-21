import type { Editor } from '@tiptap/core'
import type { NodeType, Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { normalizeItemForList } from './outline-list-utils'
import {
  findListItem,
  findSiblingListItemPos,
  isListContainerNode,
  isOutlineTextBlockNode,
  isSelectionInTable,
} from './outline-utils'

function getPromotedChildrenFragment(
  schema: Schema,
  listItemNode: ProseMirrorNode,
  parentListType: NodeType,
) {
  let childListNode: ProseMirrorNode | null = null
  listItemNode.forEach((child) => {
    if (!childListNode && isListContainerNode(child)) {
      childListNode = child
    }
  })
  if (!childListNode) {
    return null
  }
  if (childListNode.childCount === 0) {
    return null
  }

  const normalizedItems = [] as ProseMirrorNode[]
  childListNode.forEach((child) => {
    normalizedItems.push(normalizeItemForList(schema, parentListType, child))
  })
  return Fragment.fromArray(normalizedItems)
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
    if (isSelectionInTable($from)) {
      return false
    }
    if (!isOutlineTextBlockNode($from.parent) || $from.parentOffset !== 0) {
      return false
    }

    const listItem = findListItem($from)
    if (!listItem)
      return false

    const listDepth = listItem.depth - 1
    if (listDepth < 0)
      return true

    const listNode = $from.node(listDepth)
    const listPos = $from.before(listDepth)
    const listEnd = listPos + listNode.nodeSize
    const listItemPos = listItem.pos
    const listItemEnd = listItemPos + listItem.node.nodeSize
    let tr = state.tr
    let selectionPos: number | null = null

    const promotedFragment = getPromotedChildrenFragment(
      state.schema,
      listItem.node,
      listNode.type,
    )
    if (promotedFragment) {
      tr = tr.replaceWith(listItemPos, listItemEnd, promotedFragment)
      selectionPos = tr.mapping.map(listItemPos) + 1
    }
    else {
      const prevPos = findSiblingListItemPos(state, listItem, 'prev')
      const nextPos = findSiblingListItemPos(state, listItem, 'next')

      if (listNode.childCount <= 1) {
        tr = tr.delete(listPos, listEnd)
        selectionPos = Math.min(listPos, tr.doc.content.size)
      }
      else {
        tr = tr.delete(listItemPos, listItemEnd)
        const targetPos = prevPos ?? nextPos
        if (targetPos !== null) {
          selectionPos = tr.mapping.map(targetPos) + 1
        }
      }
    }

    if (selectionPos !== null) {
      tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos)))
    }

    view.dispatch(tr.scrollIntoView())
    return true
  }
}
