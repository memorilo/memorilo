import type { Editor } from '@tiptap/core'
import type { MathematicsOptions } from '@tiptap/extension-mathematics'
import { Extension } from '@tiptap/core'
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics'
import { NodeSelection } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { createBlockMathInputRule, createInlineMathInputRule } from './math-input-rules'
import { BlockMathNodeView, InlineMathNodeView } from './math-node-view'
import 'katex/dist/katex.min.css'

function insertMathNode(editor: Editor, nodeName: 'inlineMath' | 'blockMath') {
  const nodeType = editor.schema.nodes[nodeName]
  if (!nodeType) {
    return false
  }

  return editor.commands.command(({ tr, dispatch }) => {
    const { from, to } = tr.selection
    // Replace the selection with a fresh math node and focus it.
    tr.replaceWith(from, to, nodeType.create({ latex: '' }))
    tr.setSelection(NodeSelection.create(tr.doc, from))
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
      InlineMath.extend({
        addNodeView() {
          return ReactNodeViewRenderer(InlineMathNodeView)
        },
        addInputRules() {
          return [createInlineMathInputRule(this.type)]
        },
      }).configure({
        ...this.options.inlineOptions,
        katexOptions: this.options.katexOptions,
      }),
      BlockMath.extend({
        addNodeView() {
          return ReactNodeViewRenderer(BlockMathNodeView)
        },
        addInputRules() {
          return [createBlockMathInputRule(this.type)]
        },
      }).configure({
        ...this.options.blockOptions,
        katexOptions: this.options.katexOptions,
      }),
    ]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-m': () => insertMathNode(this.editor, 'inlineMath'),
      'Mod-Alt-m': () => insertMathNode(this.editor, 'blockMath'),
    }
  },
})
