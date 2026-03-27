import type { ReactNodeViewProps } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { mergeAttributes, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Match, Option } from 'effect'
import { useRef } from 'react'
import { LuCircle, LuCircleAlert, LuCircleCheck, LuCircleDot, LuCircleOff } from 'react-icons/lu'
import { OutlineUordItem } from './outline-uord-item'
import { getParentOutlineItem } from './utils/outlines'
import { useOutlineMarkerCenterStyle } from './utils/use-outline-marker-center'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    outlineTaskItem: {
      cycleTodo: (exitTodo?: boolean) => ReturnType
      toggleTodoItem: () => ReturnType
    }
  }
}

const todoStatus = ['todo', 'doing', 'done', 'discard'] as const
type TodoStatus = typeof todoStatus[number]

function OutlineTaskItemView(props: ReactNodeViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  useOutlineMarkerCenterStyle(wrapperRef, props.node)

  const icon = Match.value(props.node.attrs.status as TodoStatus).pipe(
    Match.when('todo', () => <LuCircle className="size-5" />),
    Match.when('doing', () => <LuCircleDot className="size-5 text-amber-500" />),
    Match.when('done', () => <LuCircleCheck className="size-5 text-green-500" />),
    Match.when('discard', () => <LuCircleOff className="size-5" />),
    Match.orElse(() => <LuCircleAlert className="size-5 text-red-500" />),
  )
  return (
    <NodeViewWrapper ref={wrapperRef} className="relative">
      <div
        contentEditable={false}
        className="absolute -left-8 top-(--outline-marker-center-y) -translate-y-1/2 w-6 h-6 flex items-center justify-center"
      >
        {icon}
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}

export const OutlineTaskItem = OutlineUordItem.extend({
  name: 'outlineTaskItem',
  content: 'block+',
  group: 'outlineItem',
  addAttributes() {
    return {
      status: {
        default: 'todo',
        validate(value: unknown) {
          return typeof value === 'string' && todoStatus.includes(value as TodoStatus)
        },
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'outline-task-item',
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['outline-task-item', mergeAttributes(HTMLAttributes), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(OutlineTaskItemView)
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': ({ editor }) => {
        editor.commands.cycleTodo(true)
        return true
      },
    }
  },
  addCommands() {
    return {
      toggleTodoItem: () => ({ state, dispatch }) => {
        const tr = state.tr
        const currentNode = this.editor.$pos(tr.selection.$from.pos)
        const outlineItem = getParentOutlineItem(currentNode).pipe(Option.getOrNull)
        if (!outlineItem)
          return false

        const content = outlineItem.node.content
        const itemStart = tr.selection.$from.before(outlineItem.depth)
        const itemEnd = tr.selection.$from.after(outlineItem.depth)
        const itemContentStart = itemStart + 1
        const anchorOffsetInItem = state.selection.anchor - itemContentStart
        const headOffsetInItem = state.selection.head - itemContentStart
        const targetType = Match.value(outlineItem.node.type.name).pipe(
          Match.when('outlineUordItem', () => this.editor.schema.nodes.outlineTaskItem!),
          Match.when('outlineTaskItem', () => this.editor.schema.nodes.outlineUordItem!),
          Match.orElse(() => this.editor.schema.nodes.outlineTaskItem!),
        )

        tr.replaceWith(
          itemStart,
          itemEnd,
          targetType.create(outlineItem.node.attrs, content),
        )

        // Keep the cursor/selection at the same relative offset inside the converted item.
        const mappedItemStart = tr.mapping.map(itemStart, -1)
        const mappedItem = tr.doc.nodeAt(mappedItemStart)
        if (mappedItem) {
          const mappedContentStart = mappedItemStart + 1
          const mappedContentEnd = mappedItemStart + mappedItem.nodeSize - 1
          const remapOffset = (offsetInItem: number) => Math.min(
            Math.max(mappedContentStart + offsetInItem, mappedContentStart),
            mappedContentEnd,
          )
          const nextAnchor = remapOffset(anchorOffsetInItem)
          const nextHead = remapOffset(headOffsetInItem)
          tr.setSelection(TextSelection.create(tr.doc, nextAnchor, nextHead))
        }

        if (dispatch) {
          dispatch(tr.scrollIntoView())
        }
        return true
      },
      cycleTodo: (exitTodo?: boolean) => ({ state, dispatch }) => {
        const tr = state.tr
        const currentNode = this.editor.$pos(tr.selection.$from.pos)
        const outlineItem = getParentOutlineItem(currentNode).pipe(Option.getOrNull)
        if (!outlineItem)
          return false
        if (outlineItem.node.type.name !== 'outlineTaskItem') {
          return this.editor.commands.toggleTodoItem()
        }
        const successCycle = Match.value(outlineItem.node.attrs.status as TodoStatus).pipe(
          Match.when('todo', () => {
            return this.editor.commands.updateAttributes('outlineTaskItem', { status: 'doing' })
          }),
          Match.when('doing', () => {
            return this.editor.commands.updateAttributes('outlineTaskItem', { status: 'done' })
          }),
          Match.when('done', () => {
            return this.editor.commands.updateAttributes('outlineTaskItem', { status: 'discard' })
          }),
          Match.when('discard', () => {
            if (exitTodo) {
              return this.editor.commands.toggleTodoItem()
            }
            else {
              return this.editor.commands.updateAttributes('outlineTaskItem', { status: 'todo' })
            }
          }),
          Match.orElse(() => false),
        )
        if (!successCycle)
          return false

        if (dispatch) {
          dispatch(tr.scrollIntoView())
        }
        return true
      },
    }
  },
})
