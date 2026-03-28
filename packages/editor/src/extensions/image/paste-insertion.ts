import type { Editor } from '@tiptap/core'
import type { PasteInsertionRange } from './types'

function getCurrentBlockRange(editor: Editor) {
  const { $from } = editor.state.selection

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (!node.isBlock) {
      continue
    }

    return {
      node,
      from: $from.before(depth),
      to: $from.after(depth),
    }
  }

  return null
}

export function getPasteInsertionRange(editor: Editor): PasteInsertionRange {
  const blockRange = getCurrentBlockRange(editor)
  if (blockRange) {
    if (blockRange.node.type.name === 'paragraph' && blockRange.node.content.size === 0) {
      return {
        from: blockRange.from,
        to: blockRange.to,
      }
    }

    return {
      from: blockRange.to,
      to: blockRange.to,
    }
  }

  return {
    from: editor.state.selection.from,
    to: editor.state.selection.to,
  }
}
