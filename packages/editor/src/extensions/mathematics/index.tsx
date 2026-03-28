import type { Editor } from '@tiptap/core'
import type { KatexOptions } from 'katex'
import { Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { BlockMath } from './block-math-node'
import { InlineMath } from './inline-math-node'
import 'katex/dist/katex.min.css'

export interface MathNodeOptions {
  katexOptions?: KatexOptions
}

export interface MathematicsOptions {
  inlineOptions?: MathNodeOptions
  blockOptions?: MathNodeOptions
  katexOptions?: KatexOptions
}

function insertInlineMathNode(editor: Editor) {
  const nodeType = editor.schema.nodes.inlineMath
  if (!nodeType) {
    return false
  }

  return editor.commands.command(({ tr, dispatch }) => {
    const { from, to } = tr.selection
    const selectedLatex = tr.doc.textBetween(from, to, '')
    tr.replaceWith(
      from,
      to,
      nodeType.create(
        undefined,
        selectedLatex ? tr.doc.type.schema.text(selectedLatex) : undefined,
      ),
    )
    tr.setSelection(TextSelection.create(tr.doc, from + selectedLatex.length + 1))
    if (dispatch) {
      dispatch(tr)
    }
    return true
  })
}

function insertBlockMathNode(editor: Editor) {
  const nodeType = editor.schema.nodes.blockMath
  if (!nodeType) {
    return false
  }

  return editor.commands.command(({ tr, dispatch }) => {
    const { $from, empty } = tr.selection
    if (!empty) {
      return false
    }

    const start = $from.before($from.depth)
    const end = $from.after($from.depth)
    tr.replaceWith(
      start,
      end,
      nodeType.create(),
    )
    tr.setSelection(TextSelection.create(tr.doc, start + 1))
    if (dispatch) {
      dispatch(tr)
    }
    return true
  })
}

export const Mathematics = Extension.create<MathematicsOptions>({
  name: 'mathematics',

  addOptions() {
    return {
      inlineOptions: undefined,
      blockOptions: undefined,
      katexOptions: undefined,
    }
  },

  addExtensions() {
    return [
      InlineMath.configure({
        ...this.options.inlineOptions,
        katexOptions: this.options.inlineOptions?.katexOptions ?? this.options.katexOptions,
      }),
      BlockMath.configure({
        ...this.options.blockOptions,
        katexOptions: this.options.blockOptions?.katexOptions ?? this.options.katexOptions,
      }),
    ]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-m': () => insertInlineMathNode(this.editor),
      'Mod-Alt-m': () => insertBlockMathNode(this.editor),
    }
  },
})

export default Mathematics
