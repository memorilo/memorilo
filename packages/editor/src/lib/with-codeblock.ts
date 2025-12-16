import type { Editor } from 'slate'
import { Node, Transforms } from 'slate'
import { isCodeblock, isCodeLine, isText } from './element-type'

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
      let transformedCount = 0
      const totalChildren = node.children.length
      for (let index = 0; index < totalChildren; index++) {
        const child = node.children[index]
        if (!isCodeLine(child)) {
          transformedCount++
          // Transform other element to code-line
          Transforms.setNodes(editor, {
            type: 'code-line',
            children: [...Node.descendants(child)].map(([descentant]) => descentant),
          }, {
            at: path.concat(index),
          })
        }
      }
      // If all children were removed, insert an empty code-line
      if (transformedCount === totalChildren) {
        editor.insertNode({
          type: 'code-line',
          children: [{ text: '' }],
        }, {
          at: path.concat(0),
        })
      }
      // If any child was removed, exit to allow re-normalization
      if (transformedCount > 0) {
        return
      }
    } // End isCodeblock check

    if (isCodeLine(node)) {
      // Remove all markups from the text node
      // The highlighter will be handling the formatting with decorations
      for (let i = 0; i < node.children.length; i++) {
        const baseText = node.children[i]
        if (!isText(baseText)) {
          break
        }
        if (Object.keys(baseText).length > 1) {
          const text = baseText.text
          Transforms.setNodes(editor, {
            text,
            bold: undefined,
            italic: undefined,
            strikethrough: undefined,
            underline: undefined,
            codesnippet: undefined,
          }, {
            at: path.concat(i),
          })
        }
      }
    } // End isCodeLine check
    normalizeNode(entry, options)
  }
  return editor
}
