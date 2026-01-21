import { mergeAttributes, Node } from '@tiptap/core'
import { BulletList } from '@tiptap/extension-bullet-list'
import { TaskList } from '@tiptap/extension-list'
import {
  createOutlineListBackspaceHandler,
  outlineListContent,
  outlineOrderedListContent,
} from './outline-node-helpers'
import { findListItem } from './outline-utils'

export const OutlineBulletList = BulletList.extend({
  content() {
    return outlineListContent
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Backspace: createOutlineListBackspaceHandler(this.editor),
    }
  },
})

export const OutlineTaskList = TaskList.extend({
  content() {
    return outlineListContent
  },

  addCommands() {
    return {
      ...this.parent?.(),
      toggleTaskList:
        () =>
          ({ state, dispatch, chain }) => {
            const taskItemType = state.schema.nodes.taskItem
            const listItemType = state.schema.nodes.listItem

            if (!taskItemType || !listItemType) {
              return false
            }

            const listItem = findListItem(state.selection.$from)
            if (!listItem) {
              // If we're not in a list yet, create one and immediately turn the first item into a task item.
              return chain()
                .wrapInList('bulletList')
                .command(({ tr }) => {
                  const nextListItem = findListItem(tr.selection.$from)
                  if (!nextListItem)
                    return false

                  const nextAttrs = { ...nextListItem.node.attrs }
                  if (nextAttrs.checked === undefined) {
                    nextAttrs.checked = false
                  }

                  tr.setNodeMarkup(nextListItem.pos, taskItemType, nextAttrs)
                  return true
                })
                .run()
            }

            const listDepth = listItem.depth - 1
            if (listDepth > 0) {
              const listNode = state.selection.$from.node(listDepth)
              if (listNode.type.name === 'orderedList') {
                return false
              }
            }

            const toTaskItem = listItem.node.type === listItemType
            const targetItemType = toTaskItem ? taskItemType : listItemType

            if (dispatch) {
              const tr = state.tr
              const nextAttrs = { ...listItem.node.attrs }
              if (toTaskItem) {
                if (nextAttrs.checked === undefined) {
                  nextAttrs.checked = false
                }
              }
              else if ('checked' in nextAttrs) {
                delete nextAttrs.checked
              }

              tr.setNodeMarkup(listItem.pos, targetItemType, nextAttrs)

              dispatch(tr.scrollIntoView())
            }

            return true
          },
    }
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Backspace: createOutlineListBackspaceHandler(this.editor),
    }
  },
})

export const OutlineOrderedList = Node.create({
  name: 'orderedList',

  group: 'block',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  content: outlineOrderedListContent,

  parseHTML() {
    return [{ tag: 'ol' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['ol', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addKeyboardShortcuts() {
    return {
      Backspace: createOutlineListBackspaceHandler(this.editor),
    }
  },

})
