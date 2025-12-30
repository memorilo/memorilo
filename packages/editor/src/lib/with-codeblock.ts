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
        Transforms.insertNodes(editor, {
          type: 'code-line',
          children: [{ text: '' }],
        }, { at: path.concat(0) })
        return
      }
      // Ensure all children are code-line elements
      let transformed = false
      for (let index = node.children.length - 1; index >= 0; index--) {
        const child = node.children[index]
        if (!isCodeLine(child)) {
          transformed = true
          const text = Node.string(child)
          Transforms.removeNodes(editor, { at: path.concat(index) })
          Transforms.insertNodes(editor, {
            type: 'code-line',
            children: [{ text }],
          }, { at: path.concat(index) })
        }
      }
      if (transformed)
        return
    } // End isCodeblock check

    if (isCodeLine(node)) {
      if (node.children.length === 0) {
        Transforms.insertNodes(editor, { text: '' }, { at: path.concat(0) })
        return
      }
      // Remove all markups from the text node
      // The highlighter will be handling the formatting with decorations
      let changed = false
      let hasNonTextChild = false
      for (let i = 0; i < node.children.length; i++) {
        const baseText = node.children[i]
        if (!isText(baseText)) {
          hasNonTextChild = true
          break
        }
        if (Object.keys(baseText).length > 1) {
          changed = true
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
      if (hasNonTextChild) {
        const text = Node.string(node)
        Transforms.removeNodes(editor, { at: path })
        Transforms.insertNodes(editor, {
          type: 'code-line',
          children: [{ text }],
        }, { at: path })
        return
      }
      if (changed)
        return
    } // End isCodeLine check
    normalizeNode(entry, options)
  }
  return editor
}
