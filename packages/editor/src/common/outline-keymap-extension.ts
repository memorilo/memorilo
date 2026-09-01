import type { Command, EditorState } from 'prosekit/pm/state'
import type { OutlineRuntime } from './outline-runtime'
import { defineKeymap, Priority, withPriority } from 'prosekit/core'
import { joinTextblockBackward } from 'prosekit/pm/commands'
import { TextSelection } from 'prosekit/pm/state'
import { createIndentListCommand, isListNode } from 'prosemirror-flat-list'
import { insertBlockSiblingAfter } from './block-sibling'
import { currentListBlockContext } from './list-keymap-context'
import { executeOutlineOutdent, executeOutlineOutdentForBlockIds } from './outline-outdent'

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

const continueEmptyOutlineBlock: Command = (state, dispatch) => {
  const { selection } = state
  if (!selection.empty)
    return false

  const { $from } = selection
  for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'list')
      continue
    const parent = $from.node(depth - 1)
    const isTopLevel = parent.type.name === 'doc'
    if ($from.index(depth) !== 0 || $from.parent.content.size !== 0 || (!isTopLevel && node.childCount < 2))
      return false
    const kind = node.attrs.kind
    if (typeof kind !== 'string')
      throw new Error('The current Outline block is missing its list kind')
    return insertBlockSiblingAfter(state, dispatch, {
      node,
      pos: $from.before(depth),
    }, kind)
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
    return continueEmptyOutlineBlock(state, dispatch, view)
  }
}

function createOutlineIndentCommand(runtime: OutlineRuntime): Command {
  return (state, dispatch, view) => {
    if (!runtime.getSnapshot().active)
      return false
    const block = currentListBlockContext(state)
    if (!block?.hasPreviousSiblingBlock)
      return true

    const blockNode = block.node
    return createIndentListCommand({
      from: block.position + 1,
      to: block.position + blockNode.nodeSize - 1,
    })(state, dispatch, view)
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

function createOutlineBackspaceCommand(runtime: OutlineRuntime): Command {
  return (state, dispatch, view) => {
    if (!runtime.getSnapshot().active)
      return false
    if (!(state.selection instanceof TextSelection))
      return false

    const { $cursor } = state.selection
    if (!$cursor || $cursor.parentOffset !== 0)
      return false

    const block = currentListBlockContext(state)
    if (!block)
      return false
    const directBlock = $cursor.depth === block.depth + 1
    if (!directBlock || $cursor.parent.type.name !== 'paragraph' || block.kind !== 'outline')
      return false

    joinTextblockBackward(state, dispatch, view)
    return true
  }
}

export function defineOutlineKeymapExtension(runtime: OutlineRuntime) {
  return withPriority(defineKeymap({
    'Backspace': createOutlineBackspaceCommand(runtime),
    'Enter': createOutlineEnterCommand(runtime),
    'Tab': createOutlineIndentCommand(runtime),
    'Shift-Tab': createOutlineOutdentCommand(runtime),
  }), Priority.high)
}
