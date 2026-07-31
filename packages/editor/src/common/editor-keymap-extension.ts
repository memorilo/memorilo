import type { Command } from 'prosekit/pm/state'
import { defineKeymap, Priority, union, withPriority } from 'prosekit/core'
import { newlineInCode } from 'prosekit/pm/commands'
import { AllSelection, Selection } from 'prosekit/pm/state'
import { OUTLINE_LIST_KIND } from './outline-document'

const selectAllContent: Command = (state, dispatch) => {
  if (state.doc.childCount === 1) {
    const rootBlock = state.doc.firstChild
    if (!rootBlock)
      throw new Error('A non-empty editor document is missing its root block')
    const body = rootBlock.firstChild
    if (rootBlock.type.name === 'list' && rootBlock.childCount === 1 && body?.isTextblock)
      return false
  }
  if (dispatch)
    dispatch(state.tr.setSelection(new AllSelection(state.doc)))
  return true
}

const deleteAllContent: Command = (state, dispatch) => {
  if (!(state.selection instanceof AllSelection))
    return false
  if (!dispatch)
    return true

  const listType = state.schema.nodes.list
  if (!listType)
    throw new Error('Editor schema is missing the canonical list block type')
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType)
    throw new Error('Editor schema is missing the canonical paragraph type')

  const emptyBlock = listType.create(
    { blockId: null, kind: OUTLINE_LIST_KIND },
    paragraphType.create(),
  )
  const transaction = state.tr.replaceWith(0, state.doc.content.size, emptyBlock)
  transaction.setSelection(Selection.atStart(transaction.doc))
  dispatch(transaction)
  return true
}

const codeBlockEnter: Command = (state, dispatch, view) => {
  const { selection } = state
  if (!selection.empty)
    return false

  const { $head } = selection
  const parent = $head.parent
  const shouldExitCodeBlock = parent.type.spec.code
    && $head.parentOffset === parent.content.size
    && parent.textContent.endsWith('\n\n')
  if (shouldExitCodeBlock)
    return false

  return newlineInCode(state, dispatch, view)
}

export function defineEditorKeymapExtension() {
  return union(
    withPriority(defineKeymap({
      'Backspace': deleteAllContent,
      'Delete': deleteAllContent,
      'Mod-a': selectAllContent,
    }), Priority.highest),
    withPriority(defineKeymap({ Enter: codeBlockEnter }), Priority.high),
  )
}
