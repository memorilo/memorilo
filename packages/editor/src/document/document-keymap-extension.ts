import type { Command } from 'prosekit/pm/state'
import type { OutlineRuntime } from '../common/outline-runtime'
import { defineKeymap, Priority, unsetBlockType, withPriority } from 'prosekit/core'
import { joinTextblockBackward } from 'prosekit/pm/commands'
import { TextSelection } from 'prosekit/pm/state'
import { createDedentListCommand, createIndentListCommand } from 'prosemirror-flat-list'
import { currentListBlockContext } from '../common/list-keymap-context'

const dedentList = createDedentListCommand()
const indentList = createIndentListCommand()
const unsetBlock = unsetBlockType()
const semanticListKinds = new Set(['bullet', 'ordered', 'task', 'toggle'])

function isSemanticListKind(kind: unknown): kind is string {
  return typeof kind === 'string' && semanticListKinds.has(kind)
}

function createDocumentIndentCommand(runtime: OutlineRuntime): Command {
  return (state, dispatch, view) => {
    if (runtime.getSnapshot().active)
      return false

    const block = currentListBlockContext(state)
    if (!block)
      return false
    if (!isSemanticListKind(block.kind) || !block.hasPreviousSiblingBlock)
      return true

    indentList(state, dispatch, view)
    return true
  }
}

function createDocumentDedentCommand(runtime: OutlineRuntime): Command {
  return (state, dispatch, view) => {
    if (runtime.getSnapshot().active)
      return false

    const block = currentListBlockContext(state)
    if (!block)
      return false
    if (!isSemanticListKind(block.kind) || !block.nested)
      return true

    dedentList(state, dispatch, view)
    return true
  }
}

function createDocumentBackspaceCommand(runtime: OutlineRuntime): Command {
  return (state, dispatch, view) => {
    if (runtime.getSnapshot().active)
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
    if (!directBlock)
      return false
    if ($cursor.parent.type.name === 'heading') {
      unsetBlock(state, dispatch, view)
      return true
    }
    if ($cursor.parent.type.name !== 'paragraph')
      return true

    if (block.kind === 'outline') {
      joinTextblockBackward(state, dispatch, view)
      return true
    }
    if (!isSemanticListKind(block.kind))
      return false
    if (block.hasPreviousSiblingBlock) {
      joinTextblockBackward(state, dispatch, view)
      return true
    }
    if (block.nested) {
      dedentList(state, dispatch, view)
      return true
    }

    if (dispatch) {
      const node = state.doc.nodeAt(block.position)
      if (!node)
        throw new Error(`Document list block is missing at position ${block.position}`)
      dispatch(state.tr.setNodeMarkup(block.position, undefined, {
        ...node.attrs,
        checked: false,
        collapsed: false,
        kind: 'outline',
        order: null,
      }))
    }
    return true
  }
}

export function defineDocumentKeymapExtension(runtime: OutlineRuntime) {
  return withPriority(defineKeymap({
    'Backspace': createDocumentBackspaceCommand(runtime),
    'Tab': createDocumentIndentCommand(runtime),
    'Shift-Tab': createDocumentDedentCommand(runtime),
  }), Priority.high)
}
