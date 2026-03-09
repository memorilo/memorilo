import BlockquotePrimitive from '@tiptap/extension-blockquote'

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
        const isEmptyParagraph = $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0
        const isAtParagraphBoundary = $from.parentOffset === 0
        const isLastChildInBlockquote = $from.index(blockquoteDepth) === $from.node(blockquoteDepth).childCount - 1
        if (isEmptyParagraph && isAtParagraphBoundary && isLastChildInBlockquote) {
          // Then split by top-block boundary: keep the whole blockquote in current
          // item and create a new plain outline item right after it.
          return editor.chain().command(({ tr }) => {
            const paragraphDepth = tr.selection.$from.depth
            const paragraphFrom = tr.selection.$from.before(paragraphDepth)
            const paragraphTo = tr.selection.$from.after(paragraphDepth)
            tr.delete(paragraphFrom, paragraphTo)
            return true
          }).splitOutlineItem({ atTopBlockBoundary: true }).run()
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
