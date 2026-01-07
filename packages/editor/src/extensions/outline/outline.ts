import { Extension } from '@tiptap/core'
import { OutlineBulletList, OutlineItem } from './outline-nodes'

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
    ]
  },
})
