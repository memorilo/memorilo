import type { ReactNodeViewProps } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { mergeAttributes, Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Match, Option } from 'effect'
import { LuCircle, LuCircleAlert, LuCircleCheck, LuCircleDot, LuCircleOff } from 'react-icons/lu'
import { getParentOutlineItem } from './utils/outlines'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    outlineItem: {
      cycleTodo: (exitTodo?: boolean) => ReturnType
      setTodoStatus: (status: 'todo' | 'done' | 'doing') => ReturnType
      toggleTodoItem: () => ReturnType
    }
  }
}

function OutlineItemView(_props: ReactNodeViewProps) {
  return (
    <NodeViewWrapper className="relative">
      <div
        contentEditable={false}
        className="absolute -left-8 top-0 w-6 h-6 flex items-center justify-center rounded-full group transition-all hover:bg-accent"
      >
        <span className="h-[.4em] w-[.4em] rounded-full bg-black dark:bg-white transition-all group-hover:scale-125" />
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}

export const OutlineItem = Node.create({
  name: 'outlineUordItem',
  content: 'block+',
  group: 'outlineItem',
  parseHTML() {
    return [
      {
        tag: 'outline-uord-item',
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['outline-uord-item', mergeAttributes(HTMLAttributes), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(OutlineItemView)
  },
})

const todoStatus = ['todo', 'doing', 'done', 'discard'] as const
type TodoStatus = typeof todoStatus[number]

function OutlineTaskItemView(props: ReactNodeViewProps) {
  const icon = Match.value(props.node.attrs.status as TodoStatus).pipe(
    Match.when('todo', () => <LuCircle className="size-5" />),
    Match.when('doing', () => <LuCircleDot className="size-5 text-amber-500" />),
    Match.when('done', () => <LuCircleCheck className="size-5 text-green-500" />),
    Match.when('discard', () => <LuCircleOff className="size-5" />),
    Match.orElse(() => <LuCircleAlert className="size-5 text-red-500" />),
  )
  return (
    <NodeViewWrapper className="relative">
      <div
        contentEditable={false}
        className="absolute -left-8 top-0 w-6 h-6 flex items-center justify-center"
      >
        {icon}
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}

export const OutlineTaskItem = Node.create({
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
        const targetType = Match.value(outlineItem.node.type.name).pipe(
          Match.when('outlineUordItem', () => this.editor.schema.nodes.outlineTaskItem!),
          Match.when('outlineTaskItem', () => this.editor.schema.nodes.outlineUordItem!),
          Match.orElse(() => this.editor.schema.nodes.outlineTaskItem!),
        )

        tr.replaceWith(
          tr.selection.$from.before(outlineItem.depth),
          tr.selection.$from.after(outlineItem.depth),
          targetType.create(outlineItem.node.attrs, content),
        )

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
