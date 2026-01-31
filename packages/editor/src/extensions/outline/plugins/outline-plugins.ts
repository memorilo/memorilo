import { Extension } from '@tiptap/core'
import { createOutlineNavigationPlugin } from './outline-navigation'
import { createOrderedItemInputPlugin } from './outline-ordered-input'

export const OutlinePlugins = Extension.create({
  name: 'outlinePlugins',
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      createOutlineNavigationPlugin(),
      createOrderedItemInputPlugin(),
      // NOTE: Disabled due to IME commit regression (Chinese input saves pinyin).
      // createOutlineTableGapPlugin(),
    ]
  },
})
