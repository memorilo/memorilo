import { Extension } from '@tiptap/core'
import { BulletDocument, StyledHeading } from './document'
import {
  OutlineBulletList,
  OutlineItem,
  OutlineOrderedItem,
  OutlineOrderedList,
  OutlineTaskItem,
  OutlineTaskList,
} from './outline-nodes'

export interface OutlineOptions {
  bulletListHTMLAttributes: Record<string, any>
  allowTable?: boolean
}

export const Outline = Extension.create<OutlineOptions>({
  name: 'outline',

  addOptions() {
    return {
      bulletListHTMLAttributes: {},
      allowTable: false,
    }
  },

  addExtensions() {
    const itemOptions = {
      allowTable: this.options.allowTable,
    }

    return [
      OutlineBulletList.configure({
        HTMLAttributes: this.options.bulletListHTMLAttributes,
      }),
      OutlineItem.configure(itemOptions),
      OutlineOrderedList.configure({
        HTMLAttributes: this.options.bulletListHTMLAttributes,
      }),
      OutlineOrderedItem.configure(itemOptions),
      OutlineTaskList.configure({
        HTMLAttributes: this.options.bulletListHTMLAttributes,
      }),
      OutlineTaskItem.configure(itemOptions),
      BulletDocument,
      StyledHeading.configure({
        levels: [1, 2, 3, 4, 5, 6],
      }),
    ]
  },

})
