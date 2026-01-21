import { Extension } from '@tiptap/core'

const outlineItemNames = new Set(['listItem', 'taskItem', 'orderedItem'])

export const OutlineGapCursor = Extension.create({
  name: 'outlineGapCursor',

  extendNodeSchema(extension) {
    if (!outlineItemNames.has(extension.name)) {
      return {}
    }

    // Allow gap cursor positions around outline items so table-only items are reachable.
    return { createGapCursor: true, allowGapCursor: true }
  },
})
