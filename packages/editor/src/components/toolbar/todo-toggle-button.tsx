import type { Path } from 'slate'
import { CalendarCheckIcon } from '@memorilo/components/ui/animiated-icons/calendar-check'
import { cn } from '@memorilo/utils'
import { Editor, Node, Element as SlateElement, Transforms } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { isTodo } from '../../lib/element-type'
import { findTodoParentPath, flipTodoContainingHeading } from '../../lib/todo-transforms'
import { UtilButton } from '../util-button'

const HEADING_AND_PLAIN_TYPES = ['plain', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
type HeadingOrPlainType = typeof HEADING_AND_PLAIN_TYPES[number]

function isHeadingOrPlainType(type: unknown): type is HeadingOrPlainType {
  return typeof type === 'string' && (HEADING_AND_PLAIN_TYPES as readonly string[]).includes(type)
}

function hasTodoChild(element: SlateElement) {
  const children = (element as any).children as any[] | undefined
  return Array.isArray(children)
    && children.length === 1
    && SlateElement.isElement(children[0])
    && isTodo(children[0])
}

function hasTodoWrapper(editor: Editor, path: Path, node: SlateElement) {
  return hasTodoChild(node) || findTodoParentPath(editor, path) !== null
}

function wrapBlockInTodo(editor: Editor, blockPath: number[], checked: boolean) {
  const block = Node.get(editor, blockPath)
  if (!SlateElement.isElement(block))
    return
  const children = Array.isArray(block.children) ? block.children : []

  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index]
    if (!SlateElement.isElement(child) || !isTodo(child))
      continue
    Transforms.unwrapNodes(editor, { at: blockPath.concat(index) })
  }

  Transforms.insertNodes(editor, { type: 'todo', checked, children: [] } as any, { at: blockPath.concat(0) })
  const todoPath = blockPath.concat(0)

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

export function TodoToggleButton() {
  const editor = useSlateStatic()

  const { canToggle, isActive } = useSlateSelector((editor) => {
    if (!editor.selection) {
      return { canToggle: false, isActive: false }
    }

    const at = Editor.unhangRange(editor, editor.selection)
    const entries = Array.from(Editor.nodes(editor, {
      at,
      match: n => SlateElement.isElement(n) && Editor.isBlock(editor, n) && isHeadingOrPlainType((n as any).type),
      mode: 'lowest',
    }))

    if (entries.length === 0) {
      return { canToggle: false, isActive: false }
    }

    const allActive = entries.every(([node, path]) => hasTodoWrapper(editor, path, node as SlateElement))
    return { canToggle: true, isActive: allActive }
  })

  return (
    <UtilButton
      disabled={!canToggle}
      title="Todo"
      className={cn(isActive ? 'text-blue-600 font-bold' : '')}
      onMouseDown={(e: any) => {
        e.preventDefault()
        if (!editor.selection)
          return

        const at = Editor.unhangRange(editor, editor.selection)
        const selectionRef = Editor.rangeRef(editor, editor.selection, { affinity: 'forward' })
        Editor.withoutNormalizing(editor, () => {
          const entries = Array.from(Editor.nodes(editor, {
            at,
            match: n => SlateElement.isElement(n) && Editor.isBlock(editor, n) && isHeadingOrPlainType((n as any).type),
            mode: 'lowest',
          }), ([node, path]) => ({ node: node as SlateElement, path }))

          if (entries.length === 0)
            return

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
