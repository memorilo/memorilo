import type { Node as PMNode } from '@tiptap/pm/model'
import type { KatexOptions } from 'katex'
import { findChildren, InputRule, mergeAttributes, Node } from '@tiptap/core'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { createInlineMathNodeView } from './inline-math-node-view'
const caretAnchorChar = '\u200B'
type CaretSide = 'before' | 'after'
interface ConfigurableMathNodeOptions {
  katexOptions?: KatexOptions
}

function createInlineMathCaretAnchor() {
  const anchor = document.createElement('span')
  anchor.dataset.inlineMathCaretAnchor = 'after'
  anchor.setAttribute('aria-hidden', 'true')
  anchor.textContent = caretAnchorChar
  return anchor
}

function buildInlineMathCaretAnchors(doc: PMNode, name: string) {
  const decorations = findChildren(doc, node => node.type.name === name)
    .map(({ node, pos }) =>
      Decoration.widget(pos + node.nodeSize, createInlineMathCaretAnchor, {
        side: 1,
        key: `inline-math-caret-after-${pos}`,
      }),
    )

  return DecorationSet.create(doc, decorations)
}

export const InlineMath = Node.create<ConfigurableMathNodeOptions>({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
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
        tag: 'span[data-type="inline-math"]',
        priority: 1000,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-math' }), 0]
  },

  addNodeView() {
    return createInlineMathNodeView(this.options.katexOptions)
  },

  addKeyboardShortcuts() {
    const moveCaretOutside = (side: CaretSide) => {
      return () => this.editor.commands.command(({ state, tr, dispatch }) => {
        const { selection } = state
        if (!(selection instanceof TextSelection) || !selection.empty) {
          return false
        }

        const $cursor = selection.$cursor
        if (!$cursor || $cursor.parent.type !== this.type || $cursor.depth === 0) {
          return false
        }

        const boundaryOffset = side === 'before' ? 0 : $cursor.parent.content.size
        if ($cursor.parentOffset !== boundaryOffset) {
          return false
        }

        const selectionPos = side === 'before'
          ? $cursor.before()
          : $cursor.before() + $cursor.parent.nodeSize

        tr.setSelection(TextSelection.create(tr.doc, selectionPos))
        if (dispatch) {
          dispatch(tr)
        }
        return true
      })
    }

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

          const from = $cursor.before()
          tr.delete(from, from + $cursor.parent.nodeSize)
          tr.setSelection(TextSelection.create(tr.doc, from))
          if (dispatch) {
            dispatch(tr)
          }
          return true
        })
      },
      ArrowLeft: moveCaretOutside('before'),
      ArrowRight: moveCaretOutside('after'),
    }
  },

  addProseMirrorPlugins() {
    return [
      ...this.parent?.() ?? [],
      new Plugin({
        props: {
          decorations: state => buildInlineMathCaretAnchors(state.doc, this.name),
        },
      }),
    ]
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(^|[^$])\$\$\s$/,
        handler: ({ state, range, match }) => {
          const prefix = match[1] ?? ''
          const tr = state.tr
          const start = range.from
          const end = range.to

          tr.delete(start, end)

          let insertPos = start
          if (prefix) {
            tr.insertText(prefix, insertPos)
            insertPos += prefix.length
          }

          tr.insert(
            insertPos,
            this.type.create(),
          )
          tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
        },
      }),
    ]
  },
})
