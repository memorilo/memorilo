import type { Editor } from '@tiptap/core'
import type { NodeType } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import {
  findFirstChildListPos,
  findListItem,
  isImeComposing,
  isListContainerNode,
  isOutlineTextBlockNode,
  isSelectionInTable,
} from '../core/outline-utils'
import { resolveItemTypeForList } from '../list/outline-list-utils'

function createEmptyListItem(
  listItemType: NodeType,
  paragraphType: NodeType,
) {
  const attrs = listItemType.name === 'taskItem' ? { checked: false } : null
  return listItemType.create(attrs, paragraphType.create())
}

export function createOutlineItemEnterPlugin(editor: Editor, itemTypeName: string) {
  return new Plugin({
    key: new PluginKey(`outlineItemEnterHandler:${itemTypeName}`),
    props: {
      handleKeyDown: (view, event) => {
        // IME composition can trigger Enter for commit; skip to avoid syncing preedit text.
        if (isImeComposing(view, event)) {
          return false
        }

        if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.shiftKey) {
          return false
        }

        const { state, dispatch } = view
        const { $from } = state.selection
        const parent = $from.parent

        if (isSelectionInTable($from)) {
          return false
        }
        if (!isOutlineTextBlockNode(parent)) {
          return false
        }

        const listItem = findListItem($from)
        if (!listItem) {
          return false
        }
        if (listItem.node.type.name !== itemTypeName) {
          // Only handle Enter for the matching outline item type.
          return false
        }

        const isRootItem = listItem.depth <= 1
        const isEmpty = parent.content.size === 0
        const childListPos = findFirstChildListPos(listItem)

        if (isRootItem && childListPos === null) {
          const listItemType = listItem.node.type
          const paragraphType = state.schema.nodes.paragraph
          const bulletListType = state.schema.nodes.bulletList
          const orderedListType = state.schema.nodes.orderedList
          const taskListType = state.schema.nodes.taskList
          if (!paragraphType || !bulletListType) {
            return false
          }
          const listType = listItemType.name === 'orderedItem'
            ? (orderedListType ?? bulletListType)
            : listItemType.name === 'taskItem'
              ? (taskListType ?? bulletListType)
              : bulletListType

          const contentStart = listItem.depth === 0 ? 0 : listItem.pos + 1
          const insertPos = contentStart + listItem.node.content.size
          // Root item: Enter should always create the first child list instead of a sibling.
          const childItem = createEmptyListItem(listItemType, paragraphType)
          const childList = listType.create(null, childItem)
          const tr = state.tr.insert(insertPos, childList)
          const selectionPos = Math.min(insertPos + 3, tr.doc.content.size)
          tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos)))
          dispatch(tr)
          return true
        }

        if (childListPos !== null) {
          const listItemType = listItem.node.type
          const paragraphType = state.schema.nodes.paragraph
          const childListNode = state.doc.nodeAt(childListPos)
          if (!paragraphType || !childListNode || !isListContainerNode(childListNode)) {
            return false
          }

          // Keep the child list item type consistent with the list container.
          const targetItemType = resolveItemTypeForList(state.schema, childListNode.type, listItemType) ?? listItemType
          const nextAttrs = targetItemType.name === 'taskItem' ? { checked: false } : null

          // Insert a new list item at the start of the child list.
          const tr = state.tr.insert(
            childListPos + 1,
            targetItemType.create(nextAttrs, paragraphType.create()),
          )
          tr.setSelection(TextSelection.near(tr.doc.resolve(childListPos + 2)))
          dispatch(tr)
          return true
        }

        if (isEmpty) {
          // Empty nodes without children should still create a sibling instead of lifting.
          const listItemType = listItem.node.type
          const paragraphType = state.schema.nodes.paragraph
          if (!listItemType || !paragraphType)
            return false

          const insertPos = listItem.pos + listItem.node.nodeSize
          const tr = state.tr.insert(
            insertPos,
            createEmptyListItem(listItemType, paragraphType),
          )
          tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)))
          dispatch(tr)
          return true
        }

        // Non-empty nodes without children follow the default split behavior.
        return editor.commands.splitListItem(itemTypeName)
      },
    },
  })
}
