import { Extension } from '@tiptap/core'
import { createOutlineImePreeditPlugin } from './outline-ime-preedit'
import { createOutlineNavigationPlugin } from './outline-navigation'
import { createOrderedItemInputPlugin } from './outline-ordered-input'
import { createOutlineRootInitPlugin } from './outline-root-init'
import { createOutlineTableGapPlugin } from './outline-table-gap'

export const OutlinePlugins = Extension.create({
  name: 'outlinePlugins',
  priority: 1000,

  addProseMirrorPlugins() {
    // Order matters: ensure IME preedit anchoring runs before other key handlers.
    // Without the preedit plugin, initial IME input can land outside the textblock (span/br),
    // which later syncs as preedit text instead of committed CJK.
    return [
      createOutlineImePreeditPlugin(),
      createOutlineNavigationPlugin(),
      createOrderedItemInputPlugin(),
      createOutlineRootInitPlugin(this.editor),
      createOutlineTableGapPlugin(),
    ]
  },
})
