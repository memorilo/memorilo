import BlockquotePrimitive from '@tiptap/extension-blockquote'
import { TextSelection } from '@tiptap/pm/state'
import { getParentNodeDepth } from '../utils/node-traversal'

export const Blockquote = BlockquotePrimitive.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Enter: () => {
        const { editor } = this
        const { state } = editor
        const { selection } = state
        if (!selection.empty) {
          return false
        }

        const { $from } = selection
        const blockquoteDepth = getParentNodeDepth($from, this.name)
        if (blockquoteDepth === null) {
          return false
        }

        const blockquoteNode = $from.node(blockquoteDepth)
        const isDirectChildOfBlockquote = $from.parent.type.name === 'paragraph' && $from.depth === blockquoteDepth + 1
        const isEmptyParagraph = isDirectChildOfBlockquote && $from.parent.content.size === 0
        const isAtParagraphBoundary = $from.parentOffset === 0
        const isLastChildInBlockquote = $from.index(blockquoteDepth) === blockquoteNode.childCount - 1

        if (
          isEmptyParagraph
          && isAtParagraphBoundary
          && isLastChildInBlockquote
          && blockquoteNode.childCount > 1
        ) {
          const paragraphType = state.schema.nodes.paragraph
          if (!paragraphType) {
            return false
          }

          const paragraphPos = $from.before($from.depth)
          const blockquotePos = $from.before(blockquoteDepth)
          const tr = state.tr

          // Double Enter exits the current blockquote layer by removing the
          // transient empty paragraph and inserting a sibling paragraph after it.
          tr.delete(paragraphPos, paragraphPos + $from.parent.nodeSize)

          const mappedBlockquotePos = tr.mapping.map(blockquotePos, -1)
          const mappedBlockquote = tr.doc.nodeAt(mappedBlockquotePos)
          if (!mappedBlockquote || mappedBlockquote.type.name !== this.name) {
            return false
          }

          const insertPos = mappedBlockquotePos + mappedBlockquote.nodeSize
          tr.insert(insertPos, paragraphType.create())
          tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
          editor.view.dispatch(tr.scrollIntoView())
          return true
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
