import type { Editor } from 'slate'
import { Transforms } from 'slate'
import { isMath, isMathInline, isText } from './element-type'

export function withMath(editor: Editor) {
  const { isInline, normalizeNode } = editor
  editor.isInline = (element) => {
    if (isMathInline(element)) {
      return true
    }
    return isInline(element)
  }

  editor.normalizeNode = ([node, path]) => {
    if (isMath(node)) {
      let changed = false

      // Non-recursive DFS to remove all markups from text nodes
      const stack: Array<{ node: any, path: number[] }> = [{ node, path: [] }]
      while (stack.length > 0) {
        const current = stack.pop()!
        const currentNode = current.node

        if (!currentNode.children) {
          continue
        }

        for (let i = currentNode.children.length - 1; i >= 0; i--) {
          const child = currentNode.children[i]
          const childPath = [...current.path, i]

          if (isText(child)) {
            // Remove all markups from text node
            if (Object.keys(child).length > 1) {
              changed = true
              const text = child.text
              Transforms.setNodes(editor, {
                text,
                bold: undefined,
                italic: undefined,
                strikethrough: undefined,
                underline: undefined,
                codesnippet: undefined,
              }, {
                at: [...path, ...childPath],
              })
            }
          }
          else if (child.children) {
            // Element node, push to stack for DFS
            stack.push({ node: child, path: childPath })
          }
        }
      }
      if (changed) {
        return
      }
    }
    normalizeNode([node, path])
  }

  return editor
}
