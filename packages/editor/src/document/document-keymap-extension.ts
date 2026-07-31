import type { Command, EditorState, Transaction } from 'prosekit/pm/state'
import type { OutlineRuntime } from '../common/outline-runtime'
import { defineKeymap, Priority, unsetBlockType, withPriority } from 'prosekit/core'
import { joinTextblockBackward } from 'prosekit/pm/commands'
import { TextSelection } from 'prosekit/pm/state'
import { createDedentListCommand, createIndentListCommand } from 'prosemirror-flat-list'
import { addBlockToCardBackCommand } from '../card/card-extension'
import { insertBlockSiblingAfter } from '../common/block-sibling'
import { currentListBlockContext } from '../common/list-keymap-context'
import { OUTLINE_LIST_KIND } from '../common/outline-document'

const dedentList = createDedentListCommand()
const indentList = createIndentListCommand()
const unsetBlock = unsetBlockType()
const semanticListKinds = new Set(['bullet', 'ordered', 'task', 'toggle'])
type DispatchTransaction = (transaction: Transaction) => void

function isSemanticListKind(kind: unknown): kind is string {
  return typeof kind === 'string' && semanticListKinds.has(kind)
}

function isDirectListTextCursor(state: EditorState, blockDepth: number): boolean {
  if (!(state.selection instanceof TextSelection))
    return false
  const { $cursor } = state.selection
  return $cursor !== null
    && $cursor.depth === blockDepth + 1
    && $cursor.parent.isTextblock
    && $cursor.parent.type.spec.code !== true
}

function convertDocumentBlockToOrdinary(state: EditorState, dispatch: DispatchTransaction | undefined, position: number): boolean {
  if (!dispatch)
    return true
  const node = state.doc.nodeAt(position)
  if (!node)
    throw new Error(`Document list block is missing at position ${position}`)
  dispatch(state.tr.setNodeMarkup(position, undefined, {
    ...node.attrs,
    checked: false,
    collapsed: false,
    kind: OUTLINE_LIST_KIND,
    order: null,
  }))
  return true
}

function createDocumentIndentCommand(runtime: OutlineRuntime): Command {
  return (state, dispatch, view) => {
    if (runtime.getSnapshot().active)
      return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor)
      return true

    const block = currentListBlockContext(state)
    if (!block)
      return false
    if (addBlockToCardBackCommand()(state, dispatch, view))
      return true
    if (
      !isSemanticListKind(block.kind)
      || !isDirectListTextCursor(state, block.depth)
      || !isSemanticListKind(block.previousSiblingKind)
    ) {
      return true
    }

    indentList(state, dispatch, view)
    return true
  }
}

function createDocumentDedentCommand(runtime: OutlineRuntime): Command {
  return (state, dispatch, view) => {
    if (runtime.getSnapshot().active)
      return false
    if (!(state.selection instanceof TextSelection) || !state.selection.$cursor)
      return true

    const block = currentListBlockContext(state)
    if (!block)
      return false
    if (
      !isSemanticListKind(block.kind)
      || !isDirectListTextCursor(state, block.depth)
      || !block.nested
    ) {
      return true
    }

    dedentList(state, dispatch, view)
    return true
  }
}

function createDocumentEnterCommand(runtime: OutlineRuntime): Command {
  return (state, dispatch) => {
    if (runtime.getSnapshot().active)
      return false
    if (!(state.selection instanceof TextSelection))
      return false
    const { $cursor } = state.selection
    if (!$cursor || $cursor.parent.type.name !== 'paragraph' || $cursor.parent.content.size !== 0)
      return false

    const block = currentListBlockContext(state)
    if (!block)
      return false
    const directBlock = $cursor.depth === block.depth + 1
    if (!directBlock)
      return false

    if (isSemanticListKind(block.kind)) {
      if (block.nested)
        return false
      return convertDocumentBlockToOrdinary(state, dispatch, block.position)
    }
    if (block.kind !== OUTLINE_LIST_KIND)
      return false

    const node = state.doc.nodeAt(block.position)
    if (!node)
      throw new Error(`Document list block is missing at position ${block.position}`)
    return insertBlockSiblingAfter(state, dispatch, {
      node,
      pos: block.position,
    }, OUTLINE_LIST_KIND)
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

    return convertDocumentBlockToOrdinary(state, dispatch, block.position)
  }
}

export function defineDocumentKeymapExtension(runtime: OutlineRuntime) {
  return withPriority(defineKeymap({
    'Backspace': createDocumentBackspaceCommand(runtime),
    'Enter': createDocumentEnterCommand(runtime),
    'Tab': createDocumentIndentCommand(runtime),
    'Shift-Tab': createDocumentDedentCommand(runtime),
  }), Priority.high)
}
