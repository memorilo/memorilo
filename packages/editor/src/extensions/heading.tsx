import { Heading as HeadingPrivimitive } from '@tiptap/extension-heading'

const Heading = HeadingPrivimitive.extend({
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state
        // Only work on empty selection at the beginning of the node
        if (!selection.empty || selection.$from.parentOffset !== 0) {
          return false
        }
        if (selection.$from.parent.type.name !== this.name) {
          return false
        }

        // Replace this heading to paragraph, keep cursor position unchanged
        const paragraphType = editor.state.schema.nodes.paragraph
        if (!paragraphType) {
          return false
        }

        const tr = editor.state.tr
        tr.setNodeMarkup(
          selection.$from.before(selection.$from.depth),
          paragraphType,
          selection.$from.parent.attrs,
        )
        editor.view.dispatch(tr.scrollIntoView())

        return true
      },
    }
  },

}).configure({
  levels: [1, 2, 3, 4, 5, 6],
})

export default Heading
