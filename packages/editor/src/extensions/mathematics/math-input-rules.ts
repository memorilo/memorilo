import type { NodeType } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { InputRule } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'

const inlineTrigger = /(^|[^$])\$\$\s$/
const blockTrigger = /^\$\$\$\$\s$/

function setSelectionIfInserted(tr: Transaction, pos: number, nodeType: NodeType) {
  // Only select when the node was inserted at the expected position.
  const insertedNode = tr.doc.nodeAt(pos)
  if (insertedNode && insertedNode.type === nodeType) {
    tr.setSelection(NodeSelection.create(tr.doc, pos))
  }
}

export function createInlineMathInputRule(nodeType: NodeType) {
  return new InputRule({
    find: inlineTrigger,
    handler: ({ state, range, match }) => {
      const prefix = match[1] ?? ''
      const tr = state.tr
      const start = range.from
      const end = range.to

      // Keep the character that preceded the "$$" trigger.
      tr.delete(start, end)

      let insertPos = start
      if (prefix) {
        tr.insertText(prefix, insertPos)
        insertPos += prefix.length
      }

      tr.insert(insertPos, nodeType.create({ latex: '' }))
      setSelectionIfInserted(tr, insertPos, nodeType)
    },
  })
}

export function createBlockMathInputRule(nodeType: NodeType) {
  return new InputRule({
    find: blockTrigger,
    handler: ({ state }) => {
      const { $from } = state.selection
      const parent = $from.parent
      const text = parent.textContent.trim()
      if (text !== '$$$$') {
        return null
      }

      // Replace the whole paragraph that only contains "$$$$".
      const tr = state.tr
      const start = $from.before()
      const end = $from.after()
      tr.replaceWith(start, end, nodeType.create({ latex: '' }))
      setSelectionIfInserted(tr, start, nodeType)
    },
  })
}
