import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { resolveDefaultItemTypeForList } from './outline-list-utils'
import {
  findFirstChildListPos,
  findListItem,
  isOutlineTextBlockNode,
} from './outline-utils'

export function createOutlineItemEnterPlugin(editor: Editor, itemTypeName: string) {
  return new Plugin({
    key: new PluginKey(`outlineItemEnterHandler:${itemTypeName}`),
    props: {
      handleKeyDown: (view, event) => {
        if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.shiftKey) {
          return false
        }

        const { state, dispatch } = view
        const { $from } = state.selection
        const parent = $from.parent

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

        const isEmpty = parent.content.size === 0
        const childListPos = findFirstChildListPos(listItem)

        if (childListPos !== null) {
          const childListNode = state.doc.nodeAt(childListPos)
          const listItemType = state.schema.nodes[itemTypeName]
          const paragraphType = state.schema.nodes.paragraph
          let targetItemType = listItemType ?? null
          if (childListNode) {
            targetItemType = resolveDefaultItemTypeForList(state.schema, childListNode.type)
              ?? listItemType
          }

          if (!targetItemType || !paragraphType)
            return false

          // Insert a new list item at the start of the child list.
          const tr = state.tr.insert(
            childListPos + 1,
            targetItemType.create(null, paragraphType.create()),
          )
          tr.setSelection(TextSelection.near(tr.doc.resolve(childListPos + 2)))
          dispatch(tr)
          return true
        }

        if (isEmpty) {
          // Empty nodes without children should still create a sibling instead of lifting.
          const listItemType = state.schema.nodes[itemTypeName]
          const paragraphType = state.schema.nodes.paragraph
          if (!listItemType || !paragraphType)
            return false

          const insertPos = listItem.pos + listItem.node.nodeSize
          const tr = state.tr.insert(
            insertPos,
            listItemType.create(null, paragraphType.create()),
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
