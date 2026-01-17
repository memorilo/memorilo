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
}

export const Outline = Extension.create<OutlineOptions>({
  name: 'outline',

  addOptions() {
    return {
      bulletListHTMLAttributes: {},
    }
  },

  addExtensions() {
    return [
      OutlineBulletList.configure({
        HTMLAttributes: this.options.bulletListHTMLAttributes,
      }),
      OutlineItem,
      OutlineOrderedList.configure({
        HTMLAttributes: this.options.bulletListHTMLAttributes,
      }),
      OutlineOrderedItem,
      OutlineTaskList.configure({
        HTMLAttributes: this.options.bulletListHTMLAttributes,
      }),
      OutlineTaskItem,
      BulletDocument,
      StyledHeading.configure({
        levels: [1, 2, 3, 4, 5, 6],
      }),
    ]
  },

})
