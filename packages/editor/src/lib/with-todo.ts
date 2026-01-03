import type { Editor } from 'slate'
import { Element as SlateElement } from 'slate'
import { isTodo } from './element-type'
import { flipTodoContainingHeading } from './transforms/todo'

export function withTodo(editor: Editor) {
  const { normalizeNode } = editor

  editor.normalizeNode = (entry, options) => {
    const [node, path] = entry

    if (SlateElement.isElement(node) && isTodo(node)) {
      if (flipTodoContainingHeading(editor, path))
        return
    }

    normalizeNode(entry, options)
  }

  return editor
}
