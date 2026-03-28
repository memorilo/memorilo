import { mergeAttributes } from '@tiptap/core'
import { Heading as HeadingPrimitive } from '@tiptap/extension-heading'

export const headingLevels = [1, 2, 3, 4, 5, 6] as const

export type HeadingLevel = (typeof headingLevels)[number]

export const headingLabelKeyByLevel: Record<HeadingLevel, string> = {
  1: 'editor.heading.level_1',
  2: 'editor.heading.level_2',
  3: 'editor.heading.level_3',
  4: 'editor.heading.level_4',
  5: 'editor.heading.level_5',
  6: 'editor.heading.level_6',
}

const headingClassByLevel: Record<HeadingLevel, string> = {
  1: 'text-3xl',
  2: 'text-2xl',
  3: 'text-xl',
  4: 'text-lg',
  5: 'text-base',
  6: 'text-base',
}

const Heading = HeadingPrimitive.extend({
  renderHTML({ node, HTMLAttributes }) {
    const rawLevel = Number(node.attrs.level)
    const level = headingLevels.includes(rawLevel as HeadingLevel)
      ? rawLevel as HeadingLevel
      : 1

    return [
      `h${level}`,
      mergeAttributes(HTMLAttributes, { class: headingClassByLevel[level] }),
      0,
    ]
  },

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
  levels: [...headingLevels],
})

export default Heading
