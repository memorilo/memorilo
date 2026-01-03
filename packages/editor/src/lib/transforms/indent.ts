import type { Descendant, Editor, Path, Range } from 'slate'
import type { IndentElementType, TodoElementType } from '../../slate'
import type { HeadingOrPlainType } from '../element-type'
import { Array, Option, pipe } from 'effect'
import { Node, Editor as SlateEditor, Element as SlateElement, Transforms } from 'slate'
import { isIndent, isTodo } from '../element-type'

type IndentEntry = readonly [node: IndentElementType, path: Path]

function isIndentChild(child: Descendant): boolean {
  return SlateElement.isElement(child) && isIndent(child)
}

/**
 * In outline mode, an `indent` node represents one outline item:
 * - "header" = the prefix children until the first `indent` child appears
 * - "body"   = the remaining children (nested indents)
 *
 * Sometimes an `indent` can temporarily have a header that is not a single block element
 * (e.g. header is empty, or consists of inline/text nodes, or multiple elements).
 *
 * The helpers in this module let toolbar transforms operate on the header portion by:
 * - inserting the target wrapper (`todo` / `plain` / `h1..h6`) at the header position
 * - moving the existing header children into the wrapper
 * - leaving nested `indent` children (the body) untouched
 */
export function getIndentHeaderChildCount(indent: IndentElementType): number {
  return pipe(
    Array.findFirstIndex(indent.children, isIndentChild),
    Option.getOrElse(() => indent.children.length),
  )
}

/**
 * Collect lowest-level `indent` blocks in a selection range.
 *
 * Toolbar actions primarily target heading/plain blocks. When the selection does not include
 * such blocks but still intersects `indent` containers, these are the candidates we operate on.
 */
export function getLowestIndentEntriesInRange(editor: Editor, at: Range): ReadonlyArray<IndentEntry> {
  return pipe(
    Array.fromIterable(SlateEditor.nodes(editor, {
      at,
      match: n => SlateElement.isElement(n) && SlateEditor.isBlock(editor, n) && isIndent(n),
      mode: 'lowest',
    })),
    Array.map(([node, path]) => [node as IndentElementType, path] as const),
  )
}

/**
 * Whether the indent header is currently wrapped in a `todo`.
 *
 * Only returns true when the header consists of exactly one element and that element is a todo:
 * `indent(children=[ todo(...) , ...body ])`.
 */
export function indentHeaderHasTodoWrapper(indent: IndentElementType): boolean {
  const headerCount = getIndentHeaderChildCount(indent)
  if (headerCount !== 1)
    return false
  return pipe(
    Array.head(indent.children),
    Option.map(first => SlateElement.isElement(first) && isTodo(first)),
    Option.getOrElse(() => false),
  )
}

function getElementChildCount(node: Node): number {
  return SlateElement.isElement(node) ? node.children.length : 0
}

function ensureElementHasAtLeastOneTextChild(editor: Editor, elementPath: Path) {
  if (!Node.has(editor, elementPath))
    return

  const element = Node.get(editor, elementPath)
  if (!SlateElement.isElement(element))
    return

  if (element.children.length === 0) {
    Transforms.insertNodes(editor, { text: '' }, { at: elementPath.concat(0) })
  }
}

function moveIndentHeaderChildrenInto(editor: Editor, indentPath: Path, headerCount: number, wrapperPath: Path) {
  for (let moved = 0; moved < headerCount; moved++) {
    const wrapper = Node.get(editor, wrapperPath)
    const toIndex = getElementChildCount(wrapper)
    Transforms.moveNodes(editor, { at: indentPath.concat(1), to: wrapperPath.concat(toIndex) })
  }
}

/**
 * Remove a todo wrapper from an indent header (when the header is exactly `todo`).
 *
 * This is the inverse of {@link wrapIndentHeaderInTodo}.
 */
export function unwrapIndentHeaderTodo(editor: Editor, indentPath: Path) {
  if (!Node.has(editor, indentPath))
    return

  const indent = Node.get(editor, indentPath)
  if (!SlateElement.isElement(indent) || !isIndent(indent))
    return

  const headerCount = getIndentHeaderChildCount(indent)
  if (headerCount !== 1)
    return

  const first = indent.children[0]
  if (!SlateElement.isElement(first) || !isTodo(first))
    return

  Transforms.unwrapNodes(editor, {
    at: indentPath.concat(0),
    match: n => SlateElement.isElement(n) && isTodo(n),
    split: false,
  })
}

/**
 * Wrap an indent header inside a new `todo` block.
 *
 * Steps:
 * - Insert `todo` at the header position
 * - Move all existing header children into `todo.children`
 * - Ensure the `todo` has at least one text node (Slate invariant)
 */
export function wrapIndentHeaderInTodo(editor: Editor, indentPath: Path, checked: boolean) {
  if (!Node.has(editor, indentPath))
    return

  const indent = Node.get(editor, indentPath)
  if (!SlateElement.isElement(indent) || !isIndent(indent))
    return

  const headerCount = getIndentHeaderChildCount(indent)
  const todo: TodoElementType = { type: 'todo', checked, children: [] }

  // Insert wrapper at the header position (index 0).
  Transforms.insertNodes(editor, todo, { at: indentPath.concat(0) })

  const todoPath = indentPath.concat(0)
  // Move existing header children (now shifted to index 1..n) into the wrapper.
  moveIndentHeaderChildrenInto(editor, indentPath, headerCount, todoPath)
  // Ensure wrapper isn't empty, otherwise Slate may normalize unexpectedly.
  ensureElementHasAtLeastOneTextChild(editor, todoPath)
}

/**
 * Wrap an indent header inside a new heading/plain block.
 *
 * This is used to support block type changes when the selection intersects `indent` containers
 * but does not include heading/plain blocks directly.
 */
export function wrapIndentHeaderInBlock(editor: Editor, indentPath: Path, type: HeadingOrPlainType) {
  if (!Node.has(editor, indentPath))
    return

  const indent = Node.get(editor, indentPath)
  if (!SlateElement.isElement(indent) || !isIndent(indent))
    return

  const headerCount = getIndentHeaderChildCount(indent)
  const wrapper: { type: HeadingOrPlainType, children: Descendant[] } = { type, children: [] }

  // Insert wrapper at the header position (index 0).
  Transforms.insertNodes(editor, wrapper, { at: indentPath.concat(0) })

  const wrapperPath = indentPath.concat(0)
  // Move existing header children (now shifted to index 1..n) into the wrapper.
  moveIndentHeaderChildrenInto(editor, indentPath, headerCount, wrapperPath)
  // Ensure wrapper isn't empty, otherwise Slate may normalize unexpectedly.
  ensureElementHasAtLeastOneTextChild(editor, wrapperPath)
}

