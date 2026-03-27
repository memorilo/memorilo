import type { Node as PMNode } from '@tiptap/pm/model'
import type { ReactNodeViewProps } from '@tiptap/react'
import { InputRule } from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { mergeAttributes, Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Option } from 'effect'
import { useRef } from 'react'
import { getParentBlock, getParentOutlineItem, getParentOutlineList } from './utils/outlines'
import { useOutlineMarkerCenterStyle } from './utils/use-outline-marker-center'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    outlineUordItem: {
      deleteOutlineItem: () => ReturnType
    }
  }
}

function OutlineItemView(props: ReactNodeViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  useOutlineMarkerCenterStyle(wrapperRef, props.node)

  return (
    <NodeViewWrapper ref={wrapperRef} className="relative">
      <div
        contentEditable={false}
        className="absolute -left-8 top-(--outline-marker-center-y) -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full group transition-all hover:bg-accent"
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
        find: /^(\d+)\.\s$/,
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
        // Delete the current outline list, but when the current block is non-empty,
        // move its content upward first and keep the cursor at the merged end.
        const tr = state.tr
        const currentNode = this.editor.$pos(tr.selection.$from.pos)
        const ctx = Option.gen(function* () {
          // Resolve the current block/list context from the cursor position.
          const currentBlock = yield* getParentBlock(currentNode)
          const currentOutlineItem = yield* getParentOutlineItem(currentBlock)
          const currentOutlineList = yield* getParentOutlineList(currentOutlineItem)
          return { currentBlock, currentOutlineList }
        })
        if (Option.isNone(ctx)) {
          return false
        }

        const { currentBlock, currentOutlineList } = ctx.value
        const sourceBlockContent = currentBlock.node.content
        const outlineListStart = tr.selection.$from.before(currentOutlineList.depth)
        const outlineListEnd = tr.selection.$from.after(currentOutlineList.depth)

        let cursorPosAfterMerge: number | null = null

        // If the current block has content, we must preserve user data by moving it
        // into an upper target item before removing the current outline list node.
        if (sourceBlockContent.size > 0) {
          const currentOutlineListParent = currentOutlineList.parent
          if (!currentOutlineListParent) {
            return false
          }

          const currentOutlineListIndex = tr.selection.$from.index(currentOutlineListParent.depth)
          const prevOutlineList = currentOutlineListIndex > 0
            ? currentOutlineListParent.children?.[currentOutlineListIndex - 1]
            : null
          const parentOutlineList = getParentOutlineList(currentOutlineList).pipe(Option.getOrNull)

          // Choose merge target: previous sibling list first, otherwise parent list.
          const targetOutlineList = prevOutlineList && prevOutlineList.node.type.isInGroup('outlineList')
            ? prevOutlineList
            : parentOutlineList
          if (!targetOutlineList || !targetOutlineList.node.type.isInGroup('outlineList') || targetOutlineList.node.childCount === 0) {
            return false
          }

          const targetItemPos = targetOutlineList.pos
          const targetOutlineItem = targetOutlineList.node.child(0)
          if (!targetOutlineItem.type.isInGroup('outlineItem') || targetOutlineItem.childCount === 0) {
            return false
          }

          const targetLastBlockIndex = targetOutlineItem.childCount - 1
          const targetLastBlock = targetOutlineItem.child(targetLastBlockIndex)

          // Merge strategy:
          // 1) try appending source content to the end of target's last block,
          // 2) if invalid, append a new block to the target item.
          const appendedLastBlockContent = targetLastBlock.content.append(sourceBlockContent)
          const appendedLastBlock = targetLastBlock.type.validContent(appendedLastBlockContent)
            ? targetLastBlock.type.create(targetLastBlock.attrs, appendedLastBlockContent, targetLastBlock.marks)
            : null

          let nextTargetBlocks: PMNode[] = []
          let mergedBlockIndex = targetLastBlockIndex
          // Cursor should stay at the join point (before moved content).
          let cursorOffsetInMergedBlock = targetLastBlock.content.size
          // This branch represents the "append into last target block" path.
          if (appendedLastBlock) {
            for (let index = 0; index < targetOutlineItem.childCount; index += 1) {
              nextTargetBlocks.push(index === targetLastBlockIndex ? appendedLastBlock : targetOutlineItem.child(index))
            }
            const appendedFragment = Fragment.fromArray(nextTargetBlocks)
            if (!targetOutlineItem.type.validContent(appendedFragment)) {
              nextTargetBlocks = []
            }
          }

          // If append is invalid, fallback to inserting a brand-new block at item tail.
          if (nextTargetBlocks.length === 0) {
            const copiedBlock = currentBlock.node.type.create(currentBlock.node.attrs, sourceBlockContent, currentBlock.node.marks)
            nextTargetBlocks = Array.from(
              { length: targetOutlineItem.childCount },
              (_, index) => targetOutlineItem.child(index),
            )
            nextTargetBlocks.push(copiedBlock)
            mergedBlockIndex = targetOutlineItem.childCount
            // In fallback mode, join point is the start of the appended new block.
            cursorOffsetInMergedBlock = 0
            if (!targetOutlineItem.type.validContent(Fragment.fromArray(nextTargetBlocks))) {
              return false
            }
          }

          const mappedTargetItemPos = tr.mapping.map(targetItemPos)
          const targetOutlineItemInTr = tr.doc.nodeAt(mappedTargetItemPos)
          if (!targetOutlineItemInTr) {
            return false
          }

          // Apply merged content by replacing the target outline item.
          tr.replaceWith(
            mappedTargetItemPos,
            mappedTargetItemPos + targetOutlineItemInTr.nodeSize,
            targetOutlineItem.type.create(
              targetOutlineItem.attrs,
              Fragment.fromArray(nextTargetBlocks),
              targetOutlineItem.marks,
            ),
          )

          // Compute the exact join-point position for cursor placement.
          const mappedTargetItemNode = tr.doc.nodeAt(mappedTargetItemPos)
          if (!mappedTargetItemNode || mergedBlockIndex < 0 || mergedBlockIndex >= mappedTargetItemNode.childCount) {
            return false
          }
          let mergedBlockOffset = 1
          for (let index = 0; index < mergedBlockIndex; index += 1) {
            mergedBlockOffset += mappedTargetItemNode.child(index).nodeSize
          }
          cursorPosAfterMerge = mappedTargetItemPos + mergedBlockOffset + 1 + cursorOffsetInMergedBlock
        }

        const mappedOutlineListStart = tr.mapping.map(outlineListStart)
        const mappedOutlineListEnd = tr.mapping.map(outlineListEnd)

        // Preserve child outline lists by promoting children[1..] when removing current list.
        const promotedChildren = []
        for (let index = 1; index < currentOutlineList.node.childCount; index += 1) {
          promotedChildren.push(currentOutlineList.node.child(index))
        }

        // Keep nested lists alive by replacing the removed list with its child lists.
        if (promotedChildren.length > 0) {
          tr.replaceWith(mappedOutlineListStart, mappedOutlineListEnd, Fragment.fromArray(promotedChildren))
        }
        else {
          tr.delete(mappedOutlineListStart, mappedOutlineListEnd)
        }

        // Place cursor at merged end when content moved, otherwise keep original delete behavior.
        const nextSelectionPos = cursorPosAfterMerge === null
          ? Math.min(mappedOutlineListStart, tr.doc.content.size)
          : Math.min(cursorPosAfterMerge, tr.doc.content.size)
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
        // Backspace for unordered items:
        // 1) protect non-empty top-level first item from being merged upward,
        // 2) delete only empty items as structural nodes,
        // 3) keep a single last top-level empty item as a floor node.

        const { state } = editor
        const { selection } = state
        if (!selection.empty) {
          return false
        }
        if (selection.$from.parentOffset !== 0) {
          return false
        }

        const node = editor.$pos(selection.$from.pos)
        const ctx = Option.gen(function* () {
          const block = yield* getParentBlock(node)
          const outlineItem = yield* getParentOutlineItem(block)
          const outlineList = yield* getParentOutlineList(outlineItem)
          return { block, outlineItem, outlineList }
        })
        if (Option.isNone(ctx)) {
          return false
        }

        const { block, outlineItem, outlineList } = ctx.value
        const isDirectBlockOfOutlineItem = block.depth === outlineItem.depth + 1
        if (!isDirectBlockOfOutlineItem) {
          return false
        }

        const isFirstBlockOfOutlineItem = selection.$from.index(outlineItem.depth) === 0
        // Not first block of the outline item, use other backspace behavior to delete content.
        if (!isFirstBlockOfOutlineItem) {
          return false
        }

        const outlineListIndex = selection.$from.index(outlineList.parent!.depth)
        // Not having parent list of current list and index = 0, which means current list is top-level
        // Prevent backspace to protect structure
        if (Option.isNone(getParentOutlineList(outlineList)) && outlineListIndex === 0) {
          return true
        }

        return editor.commands.deleteOutlineItem()
      },
    }
  },
})
