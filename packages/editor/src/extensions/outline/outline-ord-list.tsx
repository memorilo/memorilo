import { mergeAttributes } from '@tiptap/react'
import { OutlineUList } from './outline-uord-list'

export const OutlineOrdList = OutlineUList.extend({
  name: 'outlineOrdList',
  content: 'outlineItem outlineList*',
  parseHTML() {
    return [
      {
        tag: 'outline-ord-list',
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['outline-ord-list', mergeAttributes(HTMLAttributes), 0]
  },
})
