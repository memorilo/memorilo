import type { Path } from 'slate'
import type { TodoElementType } from '../../slate'
import { CalendarCheckIcon } from '@memorilo/components/ui/animiated-icons/calendar-check'
import { cn } from '@memorilo/utils'
import { Array as Arr, pipe } from 'effect'
import { Editor, Node, Element as SlateElement, Transforms } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { isHeadingOrPlainType, isTodo } from '../../lib/element-type'
import { getLowestIndentEntriesInRange, indentHeaderHasTodoWrapper, unwrapIndentHeaderTodo, wrapIndentHeaderInTodo } from '../../lib/transforms/indent'
import { findTodoParentPath, flipTodoContainingHeading } from '../../lib/transforms/todo'
import { UtilButton } from '../util-button'

function hasTodoChild(element: SlateElement) {
  const children = element.children
  return children.length === 1
    && SlateElement.isElement(children[0])
    && isTodo(children[0])
}

function hasTodoWrapper(editor: Editor, path: Path, node: SlateElement) {
  return hasTodoChild(node) || findTodoParentPath(editor, path) !== null
}

function wrapBlockInTodo(editor: Editor, blockPath: Path, checked: boolean) {
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

/**
 * Toolbar button that toggles todo wrapper for the current selection.
 *
 * Primary behavior: toggles a todo wrapper on selected heading/plain blocks.
 *
 * Fallback behavior: if the selection intersects `indent` containers but does not include any
 * heading/plain blocks directly, the toggle applies to the indent header portion.
 */
export function TodoToggleButton() {
  const editor = useSlateStatic()

  const { canToggle, isActive } = useSlateSelector((editor) => {
    if (!editor.selection) {
      return { canToggle: false, isActive: false }
    }

    const at = Editor.unhangRange(editor, editor.selection)
    const entries = Array.from(Editor.nodes(editor, {
      at,
      match: n => SlateElement.isElement(n) && Editor.isBlock(editor, n) && isHeadingOrPlainType(n.type),
      mode: 'lowest',
    }))

    if (entries.length === 0) {
      const indentEntries = getLowestIndentEntriesInRange(editor, at)

      if (indentEntries.length === 0)
        return { canToggle: false, isActive: false }

      /**
       * When selection hits `indent` containers without explicit heading/plain blocks,
       * compute active state by checking whether each indent header is wrapped in a todo.
       */
      const allActive = pipe(
        indentEntries,
        Arr.every(([node]) => indentHeaderHasTodoWrapper(node)),
      )
      return { canToggle: true, isActive: allActive }
    }

    const allActive = entries.every(([node, path]) => hasTodoWrapper(editor, path, node as SlateElement))
    return { canToggle: true, isActive: allActive }
  })

  return (
    <UtilButton
      disabled={!canToggle}
      title="Todo"
      className={cn(isActive ? 'text-blue-600 font-bold' : '')}
      onMouseDown={(e) => {
        e.preventDefault()
        if (!editor.selection)
          return

        const at = Editor.unhangRange(editor, editor.selection)
        const selectionRef = Editor.rangeRef(editor, editor.selection, { affinity: 'forward' })
        Editor.withoutNormalizing(editor, () => {
          const entries = Array.from(Editor.nodes(editor, {
            at,
            match: n => SlateElement.isElement(n) && Editor.isBlock(editor, n) && isHeadingOrPlainType(n.type),
            mode: 'lowest',
          }), ([node, path]) => ({ node: node as SlateElement, path }))

          if (entries.length === 0) {
            const indentEntries = getLowestIndentEntriesInRange(editor, at)

            if (indentEntries.length === 0)
              return

            // Apply toggle to each indent header (bottom-up to keep paths stable).
            const allActive = pipe(
              indentEntries,
              Arr.every(([node]) => indentHeaderHasTodoWrapper(node)),
            )
            for (const [, path] of Arr.reverse(indentEntries)) {
              if (allActive) {
                unwrapIndentHeaderTodo(editor, path)
              }
              else {
                wrapIndentHeaderInTodo(editor, path, false)
              }
            }
            return
          }

          // Regular mode: apply toggle to heading/plain blocks.
          const allActive = entries.every(({ node, path }) => hasTodoWrapper(editor, path, node))
          const handledTodoParents = new Set<string>()

          const getTodoParentPath = (path: Path) => {
            const parentTodoPath = findTodoParentPath(editor, path)
            if (!parentTodoPath)
              return null
            const key = parentTodoPath.join(',')
            if (handledTodoParents.has(key))
              return null
            handledTodoParents.add(key)
            return parentTodoPath
          }

          for (const { node, path } of entries.reverse()) {
            if (allActive) {
              if (hasTodoChild(node)) {
                Transforms.unwrapNodes(editor, {
                  at: path,
                  match: n => SlateElement.isElement(n) && n.type === 'todo',
                  split: false,
                })
              }
              else {
                const parentTodoPath = getTodoParentPath(path)
                if (parentTodoPath) {
                  Transforms.unwrapNodes(editor, {
                    at: parentTodoPath,
                    match: n => SlateElement.isElement(n) && n.type === 'todo',
                    split: false,
                  })
                }
              }
              continue
            }

            if (hasTodoChild(node)) {
              continue
            }

            const parentTodoPath = getTodoParentPath(path)
            if (parentTodoPath) {
              flipTodoContainingHeading(editor, parentTodoPath)
              continue
            }

            wrapBlockInTodo(editor, path, false)
          }
        })
        const nextSelection = selectionRef.unref()
        if (nextSelection) {
          Transforms.select(editor, nextSelection)
        }
        ReactEditor.focus(editor)
      }}
    >
      <CalendarCheckIcon size={16} />
    </UtilButton>
  )
}
