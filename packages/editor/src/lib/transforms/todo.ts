import type { Editor, Path } from 'slate'
import type { TodoElementType } from '../../slate'
import type { HeadingOrPlainType } from '../element-type'
import { Node, Element as SlateElement, Transforms } from 'slate'
import { isTodo } from '../element-type'

const HEADING_TYPES: ReadonlySet<HeadingOrPlainType> = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

function isHeadingElement(node: unknown): node is SlateElement {
  return SlateElement.isElement(node) && HEADING_TYPES.has(node.type as HeadingOrPlainType)
}

/**
 * Returns the path of the nearest parent todo node, if the immediate parent is a `todo`.
 *
 * This is used by the toolbar to detect whether a block is already inside a todo wrapper.
 */
export function findTodoParentPath(editor: Editor, path: Path): Path | null {
  if (path.length === 0)
    return null

  const parentPath = path.slice(0, -1)
  if (!Node.has(editor, parentPath))
    return null

  const parent = Node.get(editor, parentPath)
  return SlateElement.isElement(parent) && isTodo(parent) ? parentPath : null
}

/**
 * Transform a todo that contains a heading so the heading becomes the outer block and the todo becomes its first child.
 *
 * Before:
 * - todo(checked, children=[ ..., heading(type=h1..h6, children=[...]), ... ])
 *
 * After:
 * - heading(type=h1..h6, children=[ todo(checked, children=[ ...the original heading children... ]), ...rest ])
 *
 * Returns `true` when the transformation is applied; otherwise returns `false`.
 */
export function flipTodoContainingHeading(editor: Editor, todoPath: Path): boolean {
  if (!Node.has(editor, todoPath))
    return false

  const todoNode = Node.get(editor, todoPath)
  if (!SlateElement.isElement(todoNode) || !isTodo(todoNode))
    return false

  const children = todoNode.children
  const headingIndex = children.findIndex(isHeadingElement)
  if (headingIndex === -1)
    return false

  const maybeHeading = children[headingIndex]
  if (!isHeadingElement(maybeHeading))
    return false

  const headingType = maybeHeading.type as HeadingOrPlainType
  if (!HEADING_TYPES.has(headingType))
    return false

  const checked = typeof (todoNode as Partial<TodoElementType>).checked === 'boolean'
    ? (todoNode as TodoElementType).checked
    : false

  const headingPath = todoPath.concat(headingIndex)

  // If the heading already has a todo child, unwrap it first to avoid nesting.
  if (Node.has(editor, headingPath)) {
    const headingNode = Node.get(editor, headingPath)
    if (SlateElement.isElement(headingNode) && headingNode.children.length === 1) {
      const onlyChild = headingNode.children[0]
      if (SlateElement.isElement(onlyChild) && isTodo(onlyChild)) {
        Transforms.unwrapNodes(editor, { at: headingPath.concat(0) })
      }
    }
  }

  // Unwrap heading so its children become siblings within the todo container.
  Transforms.unwrapNodes(editor, {
    at: headingPath,
    match: n => SlateElement.isElement(n) && n.type === headingType,
    split: false,
  })

  // Turn the todo node into a heading node, then insert the todo wrapper as its first child.
  Transforms.setNodes<SlateElement>(editor, { type: headingType }, { at: todoPath })
  const innerTodo: TodoElementType = { type: 'todo', checked, children: [] }
  Transforms.insertNodes(editor, innerTodo, { at: todoPath.concat(0) })

  // Move all remaining children into the inner todo.
  const innerTodoPath = todoPath.concat(0)
  while (true) {
    const outerHeadingNode = Node.get(editor, todoPath)
    if (!SlateElement.isElement(outerHeadingNode) || outerHeadingNode.children.length <= 1)
      break

    const currentInnerTodo = Node.get(editor, innerTodoPath)
    if (!SlateElement.isElement(currentInnerTodo))
      break

    const toIndex = currentInnerTodo.children.length
    Transforms.moveNodes(editor, { at: todoPath.concat(1), to: innerTodoPath.concat(toIndex) })
  }

  return true
}
