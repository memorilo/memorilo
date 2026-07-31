import type { Command } from 'prosekit/pm/state'
import { defineKeymap, Priority, withPriority } from 'prosekit/core'
import { TextSelection } from 'prosekit/pm/state'

const deleteEmptyMathBlock: Command = (state, dispatch) => {
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty)
    return false

  const mathBlock = selection.$from.parent
  if (mathBlock.type.name !== 'mathBlock' || mathBlock.content.size !== 0 || selection.$from.parentOffset !== 0)
    return false

  const paragraph = state.schema.nodes.paragraph
  if (!paragraph)
    throw new Error('Deleting an empty math block requires the paragraph node')

  if (dispatch) {
    const depth = selection.$from.depth
    const position = selection.$from.before(depth)
    const transaction = state.tr.replaceWith(position, selection.$from.after(depth), paragraph.create())
    transaction.setSelection(TextSelection.create(transaction.doc, position + 1))
    dispatch(transaction)
  }
  return true
}

export function defineMathKeymapExtension() {
  return withPriority(defineKeymap({ Backspace: deleteEmptyMathBlock }), Priority.highest)
}
