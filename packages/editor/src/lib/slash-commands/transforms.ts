import type { Path, Range } from 'slate'
import { Editor, Node, Element as SlateElement, Transforms } from 'slate'
import { toCodeLines } from '../code'
import { isHeadingOrPlainType, isTodo } from '../element-type'
import { wrapBlockInTodo } from '../transforms/todo-wrapper'

type TextBlockType
  = | 'plain'
    | 'quote'
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6'

type ConvertibleBlockType = TextBlockType | 'codeblock' | 'math-block'

function isConvertibleBlockType(type: unknown): type is ConvertibleBlockType {
  return (
    typeof type === 'string'
    && (
      type === 'quote'
      || type === 'codeblock'
      || type === 'math-block'
      || isHeadingOrPlainType(type)
    )
  )
}

/**
 * Deletes the user-typed trigger token (e.g. `/h1`), while keeping the cursor in place.
 * Call this before applying a slash command so the editor content stays clean.
 */
export function deleteSlashTrigger(editor: Editor, at: Range) {
  Transforms.delete(editor, { at })
}

/**
 * Replace the children of an element node with new children.
 * Used to "convert" blocks without leaving stale nested structure.
 */
function replaceElementChildren(editor: Editor, elementPath: Path, children: any[]) {
  const node = Node.get(editor, elementPath)
  if (!SlateElement.isElement(node))
    return

  for (let index = node.children.length - 1; index >= 0; index--) {
    Transforms.removeNodes(editor, { at: elementPath.concat(index) })
  }

  Transforms.insertNodes(editor, children, { at: elementPath.concat(0) })
}

/**
 * Find the closest block that we can convert with slash commands.
 * Returns `null` if we can't safely convert in the current selection context.
 */
export function getClosestConvertibleBlockPath(editor: Editor): Path | null {
  if (!editor.selection)
    return null

  const at = editor.selection.anchor
  const entry = Editor.above(editor, {
    at,
    match: n =>
      SlateElement.isElement(n)
      && Editor.isBlock(editor, n)
      && isConvertibleBlockType((n as any).type),
    mode: 'lowest',
  })
  return entry ? entry[1] : null
}

/**
 * Convert the current block into a text-like block type (plain / heading / quote).
 * When converting from non-text blocks, we preserve the raw `Node.string(...)` content.
 */
export function setCurrentTextBlockType(editor: Editor, type: TextBlockType) {
  const blockPath = getClosestConvertibleBlockPath(editor)
  if (!blockPath)
    return

  const block = Node.get(editor, blockPath)
  if (!SlateElement.isElement(block))
    return

  if (isHeadingOrPlainType(block.type) || block.type === 'quote') {
    Transforms.setNodes(editor, { type }, { at: blockPath })
    return
  }

  const text = Node.string(block)
  Editor.withoutNormalizing(editor, () => {
    Transforms.setNodes(editor, { type }, { at: blockPath })
    replaceElementChildren(editor, blockPath, [{ text }])
  })
}

/**
 * Convert the current block into a code block.
 * We also unwrap a direct todo wrapper to avoid nested invalid structures.
 */
export function setCurrentCodeblock(editor: Editor) {
  const blockPath = getClosestConvertibleBlockPath(editor)
  if (!blockPath)
    return

  const block = Node.get(editor, blockPath)
  if (!SlateElement.isElement(block))
    return

  const text = Node.string(block)

  Editor.withoutNormalizing(editor, () => {
    Transforms.unwrapNodes(editor, { at: blockPath, match: n => SlateElement.isElement(n) && isTodo(n), split: false })
    Transforms.setNodes(editor, { type: 'codeblock' }, { at: blockPath })
    replaceElementChildren(editor, blockPath, toCodeLines(text))
  })
}

/**
 * Convert the current block into a math block.
 * We also unwrap a direct todo wrapper to avoid nested invalid structures.
 */
export function setCurrentMathBlock(editor: Editor) {
  const blockPath = getClosestConvertibleBlockPath(editor)
  if (!blockPath)
    return

  const block = Node.get(editor, blockPath)
  if (!SlateElement.isElement(block))
    return

  const text = Node.string(block)

  Editor.withoutNormalizing(editor, () => {
    Transforms.unwrapNodes(editor, { at: blockPath, match: n => SlateElement.isElement(n) && isTodo(n), split: false })
    Transforms.setNodes(editor, { type: 'math-block' }, { at: blockPath })
    replaceElementChildren(editor, blockPath, [{ text }])
  })
}

/**
 * Ensure the current block is a todo wrapper (create if missing, otherwise update checked).
 */
export function ensureTodoAtSelection(editor: Editor, checked: boolean) {
  const hasTodo = Editor.above(editor, {
    at: editor.selection ?? undefined,
    match: n => SlateElement.isElement(n) && isTodo(n),
  })

  if (hasTodo) {
    const [todo, todoPath] = hasTodo
    if (SlateElement.isElement(todo) && typeof (todo as any).checked === 'boolean') {
      Transforms.setNodes(editor, { checked }, { at: todoPath })
    }
    return
  }

  const blockPath = getClosestConvertibleBlockPath(editor)
  if (!blockPath)
    return

  wrapBlockInTodo(editor, blockPath, checked)
}

/**
 * Toggle the nearest todo checked state (walks upwards from the selection).
 */
export function toggleNearestTodoChecked(editor: Editor) {
  const todoEntry = Editor.above(editor, {
    at: editor.selection ?? undefined,
    match: n => SlateElement.isElement(n) && isTodo(n),
  })

  if (todoEntry) {
    const [todo, todoPath] = todoEntry
    const currentChecked = SlateElement.isElement(todo) && typeof (todo as any).checked === 'boolean'
      ? Boolean((todo as any).checked)
      : false
    Transforms.setNodes(editor, { checked: !currentChecked }, { at: todoPath })
    return
  }

  const blockPath = getClosestConvertibleBlockPath(editor)
  if (!blockPath)
    return

  Editor.withoutNormalizing(editor, () => {
    wrapBlockInTodo(editor, blockPath, false)
    Transforms.setNodes(editor, { checked: true }, { at: blockPath.concat(0) })
  })
}

/**
 * Insert a `math-inline` element at the current selection.
 */
export function insertInlineMath(editor: Editor) {
  if (!editor.selection)
    return

  Transforms.insertNodes(editor, { type: 'math-inline', children: [{ text: '' }] } as any)
}

/**
 * Insert or wrap the selection with a link element.
 * If selection is collapsed, inserts a link node with the URL as its text.
 */
export function insertLink(editor: Editor, url: string) {
  if (!editor.selection)
    return

  if (Editor.string(editor, editor.selection).length === 0) {
    Transforms.insertNodes(editor, { type: 'link', url, children: [{ text: url }] } as any)
    return
  }

  Transforms.wrapNodes(editor, { type: 'link', url, children: [] } as any, { split: true })
  Transforms.collapse(editor, { edge: 'end' })
}
