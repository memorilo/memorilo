import { Extension } from '@tiptap/core'
import { createOutlineNavigationPlugin } from './outline-navigation'
import { createOrderedItemInputPlugin } from './outline-ordered-input'
import { createOutlineTableGapPlugin } from './outline-table-gap'

export const OutlinePlugins = Extension.create({
  name: 'outlinePlugins',
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      createOutlineNavigationPlugin(),
      createOrderedItemInputPlugin(),
      createOutlineTableGapPlugin(),
    ]
  },
})
