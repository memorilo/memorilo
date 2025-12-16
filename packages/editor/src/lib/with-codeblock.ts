import type { Editor } from 'slate'
import { isCodeblock, isCodeLine } from './element-type'

export function withCodeblock(editor: Editor) {
  const { normalizeNode } = editor
  editor.normalizeNode = (entry, options) => {
    const [node, path] = entry
    if (isCodeblock(node)) {
      // Ensure codeblock has at least one code-line child
      if (node.children === undefined || node.children.length === 0) {
        editor.insertNode({
          type: 'code-line',
          children: [{ text: '' }],
        }, {
          at: path.concat(0),
        })
        return
      }
      // Ensure all children are code-line elements
      let removedCount = 0
      const totalChildren = node.children.length
      for (const child of node.children.values()) {
        if (!isCodeLine(child)) {
          removedCount++
          editor.removeNodes({
            match: n => n === child,
          })
        }
      }
      // If all children were removed, insert an empty code-line
      if (removedCount === totalChildren) {
        editor.insertNode({
          type: 'code-line',
          children: [{ text: '' }],
        }, {
          at: path.concat(0),
        })
      }
      // If any child was removed, exit to allow re-normalization
      if (removedCount > 0) {
        return
      }
    }
    normalizeNode(entry, options)
  }
  return editor
}
