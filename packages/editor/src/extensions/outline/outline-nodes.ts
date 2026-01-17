import type { OutlineItemOptions } from './types'
import { mergeAttributes, Node } from '@tiptap/core'
import { BulletList } from '@tiptap/extension-bullet-list'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { outlineCommands, outlineKeymap } from './outline-actions'
import { OutlineItemView } from './outline-item-view'
import {
  createOrderedItemInputPlugin,
  createOutlineItemEnterPlugin,
  createOutlineListBackspaceHandler,
  getOutlineFoldedAttributes,
  outlineItemContent,
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
            } else if ('checked' in nextAttrs) {
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

  addProseMirrorPlugins() {
    return [createOrderedItemInputPlugin()]
  },
})

export const OutlineItem = Node.create<OutlineItemOptions>({
  name: 'listItem',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  content: outlineItemContent,

  defining: true,

  addAttributes() {
    return getOutlineFoldedAttributes()
  },

  parseHTML() {
    return [{ tag: 'li' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['li', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(OutlineItemView)
  },

  addCommands() {
    return outlineCommands
  },

  addProseMirrorPlugins() {
    return [createOutlineItemEnterPlugin(this.editor, this.name)]
  },

  addKeyboardShortcuts() {
    return outlineKeymap(this.name)
  },
})

export const OutlineTaskItem = TaskItem.extend({
  content: outlineItemContent,

  addAttributes() {
    return {
      ...this.parent?.(),
      ...getOutlineFoldedAttributes(),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(OutlineItemView)
  },

  addCommands() {
    return outlineCommands
  },

  addProseMirrorPlugins() {
    return [createOutlineItemEnterPlugin(this.editor, this.name)]
  },

  addKeyboardShortcuts() {
    const parentShortcuts = this.parent?.() ?? {}
    const restShortcuts = { ...parentShortcuts }
    // Let the outline Enter handler control taskItem splitting/child insertion.
    delete restShortcuts.Enter
    // Defer Backspace behavior to the shared outline handler.
    delete restShortcuts.Backspace

    return {
      ...restShortcuts,
      ...outlineKeymap(this.name),
    }
  },
})

export const OutlineOrderedItem = Node.create<OutlineItemOptions>({
  name: 'orderedItem',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  content: outlineItemContent,

  defining: true,

  addAttributes() {
    return getOutlineFoldedAttributes()
  },

  parseHTML() {
    return [
      {
        tag: 'li',
        context: 'orderedList/',
        priority: 100,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['li', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(OutlineItemView)
  },

  addCommands() {
    return outlineCommands
  },

  addProseMirrorPlugins() {
    return [createOutlineItemEnterPlugin(this.editor, this.name)]
  },

  addKeyboardShortcuts() {
    return outlineKeymap(this.name)
  },
})
