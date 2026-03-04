import type { ReactNodeViewProps } from '@tiptap/react'
import { InputRule } from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { mergeAttributes, Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Option } from 'effect'
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
  addInputRules() {
    if (this.name !== 'outlineUordItem') {
      return []
    }

    return [
      new InputRule({
        find: /^(\d+)\.$/,
        handler: ({ state, range }) => {
          const outlineOrdItemType = state.schema.nodes.outlineOrdItem
          const outlineOrdListType = state.schema.nodes.outlineOrdList
          if (!outlineOrdItemType || !outlineOrdListType) {
            return null
          }

          const currentNode = this.editor.$pos(state.selection.$from.pos)
          const ctx = Option.gen(function* () {
            const currentBlock = yield* getParentBlock(currentNode)
            const currentOutlineItem = yield* getParentOutlineItem(currentBlock)
            const currentOutlineList = yield* getParentOutlineList(currentOutlineItem)
            return { currentOutlineItem, currentOutlineList }
          })
          if (Option.isNone(ctx)) {
            return null
          }

          const { currentOutlineItem, currentOutlineList } = ctx.value
          if (currentOutlineItem.node.type.name !== 'outlineUordItem') {
            return null
          }

          const isFirstBlockOfOutlineItem = state.selection.$from.index(currentOutlineItem.depth) === 0
          if (!isFirstBlockOfOutlineItem) {
            return null
          }

          // Only convert when the direct ancestor unordered list contains exactly:
          // [0] its own item and [1] the current parent list.
          // Example:
          //   unordered item
          //   - unordered item   <- typing "1." at the beginning of this item can convert
          // but if the ancestor has extra sibling child lists, skip conversion.
          const parentOutlineList = currentOutlineList.parent
          if (!parentOutlineList || parentOutlineList.node.type.name !== 'outlineUList') {
            return null
          }
          const isCurrentParentListOnlyChildList = parentOutlineList.node.childCount === 2
            && state.selection.$from.index(parentOutlineList.depth) === 1
            && parentOutlineList.node.child(1).type.isInGroup('outlineList')
          if (!isCurrentParentListOnlyChildList) {
            return null
          }

          const currentOutlineItemPos = state.selection.$from.before(currentOutlineItem.depth)
          const parentOutlineListPos = state.selection.$from.before(parentOutlineList.depth)

          const tr = state.tr
          // Remove the typed marker (e.g. `1.`), then switch item type
          // and only the direct ancestor unordered list type.
          // We intentionally do not rewrite higher ancestors to avoid broad structural churn.
          tr.delete(range.from, range.to)
          tr.setNodeMarkup(
            tr.mapping.map(currentOutlineItemPos),
            outlineOrdItemType,
            currentOutlineItem.node.attrs,
          )
          tr.setNodeMarkup(
            tr.mapping.map(parentOutlineListPos),
            outlineOrdListType,
            parentOutlineList.node.attrs,
          )
        },
      }),
    ]
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

        const parentOutlineList = getParentOutlineList(currentOutlineList).pipe(Option.getOrNull)
        if (currentOutlineItem.node.type.name === 'outlineOrdItem'
          && parentOutlineList?.node.type.name === 'outlineOrdList') {
          const outlineUordItemType = state.schema.nodes.outlineUordItem
          const outlineUListType = state.schema.nodes.outlineUList
          // Convert ordered -> unordered when this ordered layer is the only child-list branch.
          // Example:
          //   ordered item
          //   - ordered item   <- Backspace at start of this item converts current item/layer back to unordered.
          const isUniqueOrdLayer = parentOutlineList.node.childCount === 2
            && selection.$from.index(parentOutlineList.depth) === 1
            && parentOutlineList.node.child(1).type.isInGroup('outlineList')
          if (outlineUordItemType && outlineUListType && isUniqueOrdLayer) {
            const tr = state.tr
            tr.setNodeMarkup(
              tr.mapping.map(selection.$from.before(currentOutlineItem.depth)),
              outlineUordItemType,
              currentOutlineItem.node.attrs,
            )
            tr.setNodeMarkup(
              tr.mapping.map(selection.$from.before(parentOutlineList.depth)),
              outlineUListType,
              parentOutlineList.node.attrs,
            )
            editor.view.dispatch(tr.scrollIntoView())
            return true
          }
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
