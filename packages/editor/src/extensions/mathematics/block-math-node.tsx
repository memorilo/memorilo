import type { KatexOptions } from 'katex'
import { InputRule, mergeAttributes, Node } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { createBlockMathNodeView } from './block-math-node-view'

interface ConfigurableMathNodeOptions {
  katexOptions?: KatexOptions
}

export const BlockMath = Node.create<ConfigurableMathNodeOptions>({
  name: 'blockMath',
  group: 'block',
  content: 'text*',
  marks: '',
  draggable: true,

  addOptions() {
    return {
      katexOptions: undefined,
    }
  },

  addAttributes() {
    return {}
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="block-math"]',
        priority: 1000,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'block-math' }), 0]
  },

  addNodeView() {
    return createBlockMathNodeView(this.options.katexOptions)
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        return this.editor.commands.command(({ state, tr, dispatch }) => {
          const { selection } = state
          if (!(selection instanceof TextSelection) || !selection.empty) {
            return false
          }

          const $cursor = selection.$cursor
          if (!$cursor || $cursor.parent.type !== this.type || $cursor.depth === 0) {
            return false
          }

          if ($cursor.parentOffset !== 0 || $cursor.parent.content.size !== 0) {
            return false
          }

          const paragraphType = state.schema.nodes.paragraph
          if (!paragraphType) {
            return false
          }

          const from = $cursor.before()
          const $from = state.doc.resolve(from)
          if (!$from.parent.canReplaceWith($from.index(), $from.index() + 1, paragraphType)) {
            return false
          }

          tr.replaceWith(from, from + $cursor.parent.nodeSize, paragraphType.create())
          tr.setSelection(TextSelection.create(tr.doc, from + 1))
          if (dispatch) {
            dispatch(tr)
          }
          return true
        })
      },
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$\$\$\s$/,
        handler: ({ state }) => {
          const { $from } = state.selection
          const text = $from.parent.textContent.trim()
          if (text !== '$$$$') {
            return
          }

          const tr = state.tr
          const start = $from.before()

          tr.replaceWith(
            $from.before(),
            $from.after(),
            this.type.create(),
          )
          tr.setSelection(TextSelection.create(tr.doc, start + 1))
        },
      }),
    ]
  },
})
