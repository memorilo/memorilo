import type { MemoriloEditor } from '../slate'
import { Editor, Element, Transforms } from 'slate'
import { isLink } from './element-type'

export function withLink(editor: MemoriloEditor): MemoriloEditor {
  const { isInline, normalizeNode } = editor

  editor.isInline = (element) => {
    return element.type === 'link' ? true : isInline(element)
  }

  editor.normalizeNode = (entry) => {
    const [node, path] = entry
    if (isLink(node)) {
      const nodes = Editor.nodes(editor, {
        at: path,
        mode: 'lowest',
      })
      for (const [childNode, childPath] of nodes) {
        if (!Element.isElement(childNode))
          continue
        if (Editor.isBlock(editor, childNode)) {
          Transforms.removeNodes(editor, { at: childPath })
          return
        }
      }
    }

    normalizeNode(entry)
  }

  return editor
}
