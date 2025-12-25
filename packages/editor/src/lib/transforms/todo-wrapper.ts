import type { Editor, Path } from 'slate'
import type { TodoElementType } from '../../slate'
import { Node, Element as SlateElement, Transforms } from 'slate'
import { isTodo } from '../element-type'

/**
 * Wrap a block's content into a single todo element.
 *
 * This is extracted so both toolbar and slash-commands can reuse identical behavior.
 */
export function wrapBlockInTodo(editor: Editor, blockPath: Path, checked: boolean) {
  const block = Node.get(editor, blockPath)
  if (!SlateElement.isElement(block))
    return

  const children = Array.isArray(block.children) ? block.children : []

  // Clear nested todo wrappers directly under the block to avoid stacking todos.
  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index]
    if (!SlateElement.isElement(child) || !isTodo(child))
      continue
    Transforms.unwrapNodes(editor, { at: blockPath.concat(index) })
  }

  // Insert a new todo wrapper as the first child and move all remaining siblings into it.
  const todo: TodoElementType = { type: 'todo', checked, children: [] }
  Transforms.insertNodes(editor, todo, { at: blockPath.concat(0) })
  const todoPath = blockPath.concat(0)

  // Keep moving siblings until the block only contains the todo wrapper.
  while (true) {
    const currentBlock = Node.get(editor, blockPath)
    if (!SlateElement.isElement(currentBlock))
      continue
    if (!Array.isArray(currentBlock.children) || currentBlock.children.length <= 1)
      break

    const currentTodo = Node.get(editor, todoPath)
    if (!SlateElement.isElement(currentTodo))
      continue
    const toIndex = Array.isArray(currentTodo.children) ? currentTodo.children.length : 0
    Transforms.moveNodes(editor, { at: blockPath.concat(1), to: todoPath.concat(toIndex) })
  }
}
