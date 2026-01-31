import type { OutlineItemOptions } from '../core/types'
import type { OutlineTaskItemOptions } from './outline-item-config'
import { mergeAttributes, Node } from '@tiptap/core'
import { TaskItem } from '@tiptap/extension-list'
import { outlineKeymap } from '../actions/outline-actions'
import { getOutlineFoldedAttributes } from '../core/outline-node-constants'
import {
  outlineItemSharedSpec,
} from './outline-item-config'

export const OutlineItem = Node.create<OutlineItemOptions>({
  name: 'listItem',

  ...outlineItemSharedSpec,

  addOptions() {
    return {
      HTMLAttributes: {},
      allowTable: false,
    }
  },

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

  // TODO(IME): Disabled due to IME regression. Re-enable after fixing keymap handling.
  // addKeyboardShortcuts() {
  //   return outlineKeymap(this.name)
  // },
})

export const OutlineTaskItem = TaskItem.extend<OutlineTaskItemOptions>({
  ...outlineItemSharedSpec,

  addOptions() {
    const parent = this.parent?.() ?? {
      nested: false,
      HTMLAttributes: {},
      taskListTypeName: 'taskList',
    }
    return {
      ...parent,
      allowTable: false,
    }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      ...getOutlineFoldedAttributes(),
    }
  },

  // TODO(IME): Disabled due to IME regression. Re-enable after fixing keymap handling.
  // addKeyboardShortcuts() {
  //   const parentShortcuts = this.parent?.() ?? {}
  //   const restShortcuts = { ...parentShortcuts }
  //   // Let the outline Enter handler control taskItem splitting/child insertion.
  //   delete restShortcuts.Enter
  //   // Defer Backspace behavior to the shared outline handler.
  //   delete restShortcuts.Backspace
  //
  //   return {
  //     ...restShortcuts,
  //     ...outlineKeymap(this.name),
  //   }
  // },

})

export const OutlineOrderedItem = Node.create<OutlineItemOptions>({
  name: 'orderedItem',

  ...outlineItemSharedSpec,

  addOptions() {
    return {
      HTMLAttributes: {},
      allowTable: false,
    }
  },

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

  // TODO(IME): Disabled due to IME regression. Re-enable after fixing keymap handling.
  // addKeyboardShortcuts() {
  //   return outlineKeymap(this.name)
  // },
})
