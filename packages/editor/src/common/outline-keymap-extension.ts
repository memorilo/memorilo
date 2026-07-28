import type { Command, EditorState } from 'prosekit/pm/state'
import type { OutlineRuntime } from './outline-runtime'
import { defineKeymap, Priority, withPriority } from 'prosekit/core'
import { TextSelection } from 'prosekit/pm/state'
import { createIndentListCommand, isListNode } from 'prosemirror-flat-list'
import { currentListBlockContext } from './list-keymap-context'
import { executeOutlineOutdent, executeOutlineOutdentForBlockIds } from './outline-outdent'

const indentList = createIndentListCommand()

function trailingNestedEmptyBlockId(state: EditorState, focusBlockId: string | null): string | null {
  const { $from } = state.selection
  if (!$from.parent.isTextblock || $from.parent.type.name !== 'paragraph' || $from.parent.content.size !== 0)
    return null

  for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (!isListNode(node))
      continue
    const parent = $from.node(depth - 1)
    if (parent.type.name === 'doc')
      return null
    if ($from.index(depth - 1) !== parent.childCount - 1)
      return null
    if (parent.attrs.blockId === focusBlockId)
      return null
    const blockId = node.attrs.blockId
    if (typeof blockId !== 'string' || blockId.length === 0)
      throw new Error('The trailing empty Outline block is missing its stable id')
    return blockId
  }
  return null
}

const insertSiblingAfterEmptyBranch: Command = (state, dispatch) => {
  const { selection } = state
  if (!selection.empty)
    return false

  const { $from } = selection
  for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'list')
      continue
    if ($from.index(depth) !== 0 || $from.parent.content.size !== 0 || node.childCount < 2)
      return false

    const sibling = node.type.createAndFill({ kind: node.attrs.kind })
    if (!sibling)
      throw new Error('Unable to create an empty Outline sibling')
    if (!dispatch)
      return true

    const insertPosition = $from.after(depth)
    const transaction = state.tr.insert(insertPosition, sibling)
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(insertPosition + 1), 1))
    dispatch(transaction.scrollIntoView())
    return true
  }

  return false
}

function createOutlineEnterCommand(runtime: OutlineRuntime): Command {
  return (state, dispatch, view) => {
    const snapshot = runtime.getSnapshot()
    if (!snapshot.active)
      return false
    const blockId = trailingNestedEmptyBlockId(state, snapshot.focusBlockId)
    if (blockId) {
      if (dispatch)
        executeOutlineOutdentForBlockIds(state, dispatch, runtime, [blockId])
      return true
    }
    return insertSiblingAfterEmptyBranch(state, dispatch, view)
  }
}

function hasPreviousSiblingBlock(state: EditorState): boolean {
  const block = currentListBlockContext(state)
  return block !== null && block.hasPreviousSiblingBlock
}

function createOutlineIndentCommand(runtime: OutlineRuntime): Command {
  return (state, dispatch, view) => {
    if (!runtime.getSnapshot().active)
      return false
    if (!hasPreviousSiblingBlock(state))
      return true
    return indentList(state, dispatch, view)
  }
}

function createOutlineOutdentCommand(runtime: OutlineRuntime): Command {
  return (state, dispatch) => {
    if (!runtime.getSnapshot().active)
      return false
    if (dispatch)
      executeOutlineOutdent(state, dispatch, runtime)
    return true
  }
}

export function defineOutlineKeymapExtension(runtime: OutlineRuntime) {
  return withPriority(defineKeymap({
    'Enter': createOutlineEnterCommand(runtime),
    'Tab': createOutlineIndentCommand(runtime),
    'Shift-Tab': createOutlineOutdentCommand(runtime),
  }), Priority.high)
}
