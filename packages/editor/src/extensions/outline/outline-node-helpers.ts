import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import {
  findFirstChildListPos,
  findListItem,
  findSiblingListItemPos,
  isEmptyOutlineParagraph,
  isOutlineTextBlockNode,
} from './outline-utils'

export const outlineItemContent = '(paragraph | heading | codeBlock | image | blockMath) block*'
export const outlineListContent = '(listItem|taskItem)+'

export function getOutlineFoldedAttributes() {
  return {
    folded: {
      default: false,
      keepOnSplit: false,
      parseHTML: () => false,
      renderHTML: () => ({}),
    },
  }
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

    if (listItem.node.childCount > 1) {
      // Preserve the list item when deleting a trailing empty paragraph.
      const paragraphPos = $from.before($from.depth)
      const tr = state.tr.delete(paragraphPos, paragraphPos + $from.parent.nodeSize)
      view.dispatch(tr)
      return true
    }

    const listDepth = listItem.depth - 1
    if (listDepth < 0)
      return true

    const listNode = $from.node(listDepth)
    if (listNode.childCount <= 1) {
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
          // Nodes with children always insert a new child item (same type as the current item).
          const listItemType = state.schema.nodes[itemTypeName]
          const paragraphType = state.schema.nodes.paragraph
          if (!listItemType || !paragraphType)
            return false

          // Insert a new list item at the start of the child list.
          const tr = state.tr.insert(
            childListPos + 1,
            listItemType.create(null, paragraphType.create()),
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

export function createTaskListFallbackPlugin() {
  return new Plugin({
    key: new PluginKey('outlineTaskListFallback'),
    appendTransaction: (transactions, oldState, newState) => {
      if (transactions.some(tr => tr.getMeta('outlineTaskListAllowBullet'))) {
        return null
      }

      if (!transactions.some(tr => tr.docChanged)) {
        return null
      }

      const oldRoot = oldState.doc.firstChild
      const newRoot = newState.doc.firstChild
      if (!oldRoot || !newRoot)
        return null

      if (oldRoot.type.name !== 'taskList' || newRoot.type.name !== 'bulletList') {
        return null
      }

      if (newState.doc.childCount !== 1 || newRoot.childCount !== 1) {
        return null
      }

      const listItem = newRoot.firstChild
      if (!listItem || listItem.type.name !== 'listItem' || listItem.childCount !== 1) {
        return null
      }

      const firstChild = listItem.firstChild
      if (!firstChild || !isEmptyOutlineParagraph(firstChild)) {
        return null
      }

      const taskListType = newState.schema.nodes.taskList
      const taskItemType = newState.schema.nodes.taskItem
      const paragraphType = newState.schema.nodes.paragraph
      if (!taskListType || !taskItemType || !paragraphType) {
        return null
      }

      // When the last task item is removed, ProseMirror may insert a bullet list.
      // Replace that placeholder list with an empty task list to keep the outline UI stable.
      const taskItem = taskItemType.create(null, paragraphType.create())
      const taskList = taskListType.create(null, taskItem)
      return newState.tr.replaceWith(0, newState.doc.content.size, taskList)
    },
  })
}
