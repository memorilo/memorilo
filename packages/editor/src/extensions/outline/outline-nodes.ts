import type { OutlineItemOptions } from './types'
import { mergeAttributes, Node } from '@tiptap/core'
import { BulletList } from '@tiptap/extension-bullet-list'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { outlineCommands, outlineKeymap } from './outline-actions'
import { OutlineItemView } from './outline-item-view'
import {
  createOutlineItemEnterPlugin,
  createOutlineListBackspaceHandler,
  createTaskListFallbackPlugin,
  getOutlineFoldedAttributes,
  outlineItemContent,
  outlineListContent,
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

  addProseMirrorPlugins() {
    return [createTaskListFallbackPlugin()]
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Backspace: createOutlineListBackspaceHandler(this.editor),
    }
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
    return {
      ...this.parent?.(),
      ...outlineKeymap(this.name),
    }
  },
})
