import type { ReactNodeViewProps } from '@tiptap/react'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { mergeAttributes, Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Match, Option } from 'effect'
import { LuCircle, LuCircleAlert, LuCircleCheck, LuCircleDot, LuCircleOff } from 'react-icons/lu'
import { getParentBlock, getParentOutlineItem, getParentOutlineList } from './utils/outlines'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    outlineUordItem: {
      deleteOutlineItem: () => ReturnType
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

export const OutlineUordItem = Node.create({
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
  addCommands() {
    return {
      deleteOutlineItem: () => ({ state, dispatch }) => {
        const tr = state.tr
        const currentNode = this.editor.$pos(tr.selection.$from.pos)
        const ctx = Option.gen(function* () {
          const currentBlock = yield* getParentBlock(currentNode)
          const currentOutlineItem = yield* getParentOutlineItem(currentBlock)
          const currentOutlineList = yield* getParentOutlineList(currentOutlineItem)
          return { currentOutlineList }
        })
        if (Option.isNone(ctx)) {
          return false
        }

        const { currentOutlineList } = ctx.value
        const outlineListStart = tr.selection.$from.before(currentOutlineList.depth)
        const outlineListEnd = tr.selection.$from.after(currentOutlineList.depth)
        // Keep child outline lists by promoting them when deleting the current list item.
        const promotedChildren = []
        for (let index = 1; index < currentOutlineList.node.childCount; index += 1) {
          promotedChildren.push(currentOutlineList.node.child(index))
        }

        if (promotedChildren.length > 0) {
          tr.replaceWith(outlineListStart, outlineListEnd, Fragment.fromArray(promotedChildren))
        }
        else {
          tr.delete(outlineListStart, outlineListEnd)
        }

        const nextSelectionPos = Math.min(outlineListStart, tr.doc.content.size)
        tr.setSelection(TextSelection.near(tr.doc.resolve(nextSelectionPos), -1))
        if (dispatch) {
          dispatch(tr.scrollIntoView())
        }
        return true
      },
    }
  },
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { state } = editor
        const { selection } = state
        if (!selection.empty) {
          return false
        }
        if (selection.$from.parentOffset !== 0) {
          return false
        }

        const currentNode = editor.$pos(selection.$from.pos)
        const ctx = Option.gen(function* () {
          const currentBlock = yield* getParentBlock(currentNode)
          const currentOutlineItem = yield* getParentOutlineItem(currentBlock)
          const currentOutlineList = yield* getParentOutlineList(currentOutlineItem)
          return { currentOutlineItem, currentOutlineList }
        })
        if (Option.isNone(ctx)) {
          return false
        }

        const { currentOutlineItem, currentOutlineList } = ctx.value
        const isFirstBlockOfOutlineItem = selection.$from.index(currentOutlineItem.depth) === 0
        if (!isFirstBlockOfOutlineItem) {
          return false
        }

        const currentOutlineListParent = currentOutlineList.parent
        if (!currentOutlineListParent) {
          return false
        }

        const currentOutlineListIndex = selection.$from.index(currentOutlineListParent.depth)
        const hasParentOutlineList = Option.isSome(getParentOutlineList(currentOutlineList))
        const isTopLevelFirstItem = !hasParentOutlineList && currentOutlineListIndex === 0
        // "Empty item" means exactly one empty text block.
        const isEmptyItem = currentOutlineItem.node.childCount === 1
          && !!currentOutlineItem.node.firstChild?.isTextblock
          && currentOutlineItem.node.firstChild.content.size === 0
        if (isTopLevelFirstItem && !isEmptyItem) {
          return true
        }

        if (!isEmptyItem) {
          return false
        }

        const hasPromotedChildren = currentOutlineList.node.childCount > 1
        const isLastTopLevelItem = !hasParentOutlineList && currentOutlineListParent.node.childCount === 1
        if (isLastTopLevelItem && !hasPromotedChildren) {
          return true
        }

        return editor.commands.deleteOutlineItem()
      },
    }
  },
})
