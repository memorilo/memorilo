import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import BlockquotePrimitive from '@tiptap/extension-blockquote'

function findAncestorDepth($pos: ResolvedPos, predicate: (node: PMNode) => boolean) {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if (predicate($pos.node(depth))) {
      return depth
    }
  }

  return -1
}

function getChildPos(contentStart: number, parentNode: PMNode, childIndex: number) {
  let offset = 0
  for (let index = 0; index < childIndex; index += 1) {
    offset += parentNode.child(index).nodeSize
  }

  return contentStart + offset
}

export const Blockquote = BlockquotePrimitive.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Enter: () => {
        const { editor } = this
        const { selection } = editor.state
        if (!selection.empty) {
          return false
        }

        const { $from } = selection
        let blockquoteDepth = -1
        for (let depth = $from.depth; depth >= 0; depth -= 1) {
          if ($from.node(depth).type.name === this.name) {
            blockquoteDepth = depth
            break
          }
        }

        if (blockquoteDepth < 0) {
          return false
        }

        /**
         * Second Enter in blockquote tail:
         * - current paragraph is empty
         * - cursor is at that paragraph start/end
         * - this paragraph is the last child of the current blockquote
         *
         * In this case we leave blockquote and create a new outline item by
         * delegating to outline split logic.
         */
        const blockquoteNode = $from.node(blockquoteDepth)
        const isEmptyParagraph = $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0
        const isAtParagraphBoundary = $from.parentOffset === 0
        const isLastChildInBlockquote = $from.index(blockquoteDepth) === blockquoteNode.childCount - 1
        if (isEmptyParagraph && isAtParagraphBoundary && isLastChildInBlockquote) {
          // Leave a single empty paragraph blockquote untouched; otherwise it would become invalid.
          const shouldCleanupTailParagraph = blockquoteNode.childCount > 1

          return editor.chain()
            // Split first so outline resolution still sees the intact blockquote tree.
            .splitOutlineItem({ atTopBlockBoundary: true })
            .command(({ tr }) => {
              if (!shouldCleanupTailParagraph) {
                return true
              }

              // The split places the cursor in the new right-hand outline item.
              const currentOutlineListDepth = findAncestorDepth(
                tr.selection.$from,
                node => node.type.isInGroup('outlineList'),
              )
              if (currentOutlineListDepth < 0) {
                return true
              }

              const currentOutlineListParentDepth = currentOutlineListDepth - 1
              const currentOutlineListParent = tr.selection.$from.node(currentOutlineListParentDepth)
              const currentOutlineListIndex = tr.selection.$from.index(currentOutlineListParentDepth)

              let leftOutlineListPos = -1
              if (
                currentOutlineListIndex > 0
                && currentOutlineListParent.child(currentOutlineListIndex - 1).type.isInGroup('outlineList')
              ) {
                // Normal split path: the original item stays in the previous sibling list.
                leftOutlineListPos = getChildPos(
                  tr.selection.$from.start(currentOutlineListParentDepth),
                  currentOutlineListParent,
                  currentOutlineListIndex - 1,
                )
              }
              else {
                // Nested split path: the original item is the nearest ancestor outline list.
                for (let depth = currentOutlineListDepth - 1; depth >= 0; depth -= 1) {
                  if (tr.selection.$from.node(depth).type.isInGroup('outlineList')) {
                    leftOutlineListPos = tr.selection.$from.before(depth)
                    break
                  }
                }
              }

              if (leftOutlineListPos < 0) {
                return true
              }

              const leftOutlineList = tr.doc.nodeAt(leftOutlineListPos)
              if (!leftOutlineList) {
                return true
              }

              const leftOutlineItemPos = getChildPos(leftOutlineListPos + 1, leftOutlineList, 0)
              const leftOutlineItem = leftOutlineList.child(0)
              const leftBlockquoteIndex = leftOutlineItem.childCount - 1
              const leftBlockquotePos = getChildPos(leftOutlineItemPos + 1, leftOutlineItem, leftBlockquoteIndex)
              const leftBlockquote = leftOutlineItem.child(leftBlockquoteIndex)
              const tailParagraphIndex = leftBlockquote.childCount - 1
              const tailParagraphPos = getChildPos(leftBlockquotePos + 1, leftBlockquote, tailParagraphIndex)
              const tailParagraph = leftBlockquote.child(tailParagraphIndex)

              // Remove the transient empty paragraph that triggered the exit.
              tr.delete(tailParagraphPos, tailParagraphPos + tailParagraph.nodeSize)
              return true
            })
            .run()
        }

        // Inside blockquote, single Enter should split/insert paragraph in-place.
        return editor.commands.splitBlock()
      },
    }
  },
}).configure({
  HTMLAttributes: {
    class: 'border-l-[3px] border-solid border-gray-300 rounded-none bg-transparent shadow-none outline-none [&>*]:ml-2',
  },
})

export default Blockquote
