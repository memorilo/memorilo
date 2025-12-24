import type { Editor, Path } from 'slate'
import { Node, Element as SlateElement, Transforms } from 'slate'
import { isTodo } from './element-type'

const HEADING_TYPES = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

function isHeadingElement(node: unknown): node is SlateElement {
  return SlateElement.isElement(node) && HEADING_TYPES.has((node as any).type)
}

export function findTodoParentPath(editor: Editor, path: Path): Path | null {
  if (path.length === 0)
    return null

  const parentPath = path.slice(0, -1)
  if (!Node.has(editor, parentPath))
    return null

  const parent = Node.get(editor, parentPath)
  return SlateElement.isElement(parent) && isTodo(parent) ? parentPath : null
}

export function flipTodoContainingHeading(editor: Editor, todoPath: Path): boolean {
  if (!Node.has(editor, todoPath))
    return false

  const todo = Node.get(editor, todoPath)
  if (!SlateElement.isElement(todo) || !isTodo(todo))
    return false

  const children = Array.isArray(todo.children) ? todo.children : []
  const headingIndex = children.findIndex(isHeadingElement)
  if (headingIndex === -1)
    return false

  const heading = children[headingIndex] as any
  const headingType = heading?.type
  if (!headingType || typeof headingType !== 'string')
    return false

  const checked = typeof todo.checked === 'boolean' ? todo.checked : false
  const headingPath = todoPath.concat(headingIndex)

  if (Node.has(editor, headingPath)) {
    const headingNode = Node.get(editor, headingPath) as any
    const headingChildren = Array.isArray(headingNode?.children) ? headingNode.children : []
    if (headingChildren.length === 1 && SlateElement.isElement(headingChildren[0]) && isTodo(headingChildren[0])) {
      Transforms.unwrapNodes(editor, { at: headingPath.concat(0) })
    }
  }

  Transforms.unwrapNodes(editor, {
    at: headingPath,
    match: n => SlateElement.isElement(n) && (n as any).type === headingType,
    split: false,
  })

  Transforms.setNodes(editor, { type: headingType } as any, { at: todoPath })
  Transforms.insertNodes(editor, { type: 'todo', checked, children: [] } as any, { at: todoPath.concat(0) })

  const innerTodoPath = todoPath.concat(0)
  while (true) {
    const currentHeading = Node.get(editor, todoPath) as any
    if (!Array.isArray(currentHeading.children) || currentHeading.children.length <= 1)
      break

    const currentTodo = Node.get(editor, innerTodoPath) as any
    const toIndex = Array.isArray(currentTodo.children) ? currentTodo.children.length : 0
    Transforms.moveNodes(editor, { at: todoPath.concat(1), to: innerTodoPath.concat(toIndex) })
  }

  return true
}
