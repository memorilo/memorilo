import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import type { KatexOptions } from 'katex'
import { findChildren, InputRule, mergeAttributes, Node } from '@tiptap/core'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { moveInlineMathCaretVertically } from './inline-math-navigation'
import { InlineMathNodeView } from './inline-math-node-view'

const caretAnchorChar = '\u200B'
type CaretSide = 'before' | 'after'
interface ConfigurableMathNodeOptions {
  katexOptions?: KatexOptions
}

function createInlineMathCaretAnchor(side: CaretSide) {
  const anchor = document.createElement('span')
  anchor.dataset.inlineMathCaretAnchor = side
  anchor.setAttribute('aria-hidden', 'true')
  anchor.textContent = caretAnchorChar
  return anchor
}

function buildInlineMathCaretAnchors(doc: PMNode, name: string) {
  return DecorationSet.create(
    doc,
    findChildren(doc, node => node.type.name === name).flatMap(({ node, pos }) => [
      Decoration.widget(pos, () => createInlineMathCaretAnchor('before'), {
        side: -1,
        key: `inline-math-caret-before-${pos}`,
      }),
      Decoration.widget(pos + node.nodeSize, () => createInlineMathCaretAnchor('after'), {
        side: 1,
        key: `inline-math-caret-after-${pos}`,
      }),
    ]),
  )
}

function getInlineMathBoundaryTextInsertPos(view: EditorView, name: string) {
  const { selection } = view.state
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return null
  }

  const { $from } = selection
  if ($from.parent.type.name === name) {
    return null
  }

  if ($from.nodeBefore?.type.name !== name && $from.nodeAfter?.type.name !== name) {
    return null
  }

  return selection.from
}

function insertTextAtInlineMathBoundary(view: EditorView, name: string, text: string) {
  const insertPos = getInlineMathBoundaryTextInsertPos(view, name)
  if (insertPos === null) {
    return false
  }

  view.dispatch(view.state.tr.insertText(text, insertPos, insertPos))
  return true
}

function getInlineMathEntryPosFromAdjacentSelection(
  selection: TextSelection,
  name: string,
  direction: 'left' | 'right',
) {
  const { $from } = selection
  if ($from.parent.type.name === name) {
    return null
  }

  if (direction === 'right') {
    return $from.nodeAfter?.type.name === name
      ? selection.from + 1
      : null
  }

  return $from.nodeBefore?.type.name === name
    ? selection.from - 1
    : null
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
    return ReactNodeViewRenderer(
      props => <InlineMathNodeView {...props} katexOptions={this.options.katexOptions} />,
    )
  },

  addKeyboardShortcuts() {
    const moveCaretHorizontally = (side: CaretSide) => {
      return () => this.editor.commands.command(({ state, tr, dispatch }) => {
        const { selection } = state
        if (!(selection instanceof TextSelection) || !selection.empty) {
          return false
        }

        const $cursor = selection.$cursor
        if ($cursor && $cursor.parent.type === this.type && $cursor.depth > 0) {
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
        }

        const entryPos = getInlineMathEntryPosFromAdjacentSelection(
          selection,
          this.name,
          side === 'after' ? 'right' : 'left',
        )
        if (entryPos === null) {
          return false
        }

        tr.setSelection(TextSelection.create(tr.doc, entryPos))
        if (dispatch) {
          dispatch(tr)
        }
        return true
      })
    }

    const moveCaretVertically = (dir: -1 | 1) => {
      return () => this.editor.commands.command(({ state, tr, dispatch, view }) =>
        moveInlineMathCaretVertically(state, tr, dispatch, view, this.name, dir))
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
      ArrowLeft: moveCaretHorizontally('before'),
      ArrowRight: moveCaretHorizontally('after'),
      ArrowUp: moveCaretVertically(-1),
      ArrowDown: moveCaretVertically(1),
    }
  },

  addProseMirrorPlugins() {
    return [
      ...this.parent?.() ?? [],
      new Plugin({
        props: {
          decorations: state => buildInlineMathCaretAnchors(state.doc, this.name),
          handleDOMEvents: {
            beforeinput: (view, event) => {
              const inputEvent = event as InputEvent
              if (!inputEvent.data) {
                return false
              }

              if (inputEvent.inputType !== 'insertText' && inputEvent.inputType !== 'insertCompositionText') {
                return false
              }

              if (!insertTextAtInlineMathBoundary(view, this.name, inputEvent.data)) {
                return false
              }

              inputEvent.preventDefault()
              event.preventDefault()
              return true
            },
          },
          handleKeyDown: (view, event) => {
            if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
              return false
            }

            if (!insertTextAtInlineMathBoundary(view, this.name, event.key)) {
              return false
            }

            event.preventDefault()
            return true
          },
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
