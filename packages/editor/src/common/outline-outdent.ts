import type { Node as ProseMirrorNode } from 'prosekit/pm/model'
import type { EditorState, Transaction } from 'prosekit/pm/state'
import type { OutdentBlockedReason, OutdentResult, OutlineMoveDirection, OutlineMoveResult } from './outline-commands'
import type { OutlineRuntime, OutlineRuntimeSnapshot } from './outline-runtime'
import { AllSelection, NodeSelection, Selection, TextSelection } from 'prosekit/pm/state'
import { planMove, planOutdent } from './outline-commands'

const TRADITIONAL_SELECTION_MESSAGE = 'Traditional outdent requires consecutive blocks under the same parent. Adjust the selection or switch to Logical outdent.'

interface BlockRelativePosition {
  blockId: string
  offset: number
}

type OutlineSelectionBookmark
  = | { type: 'all' }
    | { anchor: BlockRelativePosition, head: BlockRelativePosition, type: 'text' }
    | { anchor: BlockRelativePosition, type: 'node' }
    | { bias: -1 | 1, head: BlockRelativePosition, type: 'near' }

function captureBlockRelativePosition(doc: ProseMirrorNode, position: number): BlockRelativePosition {
  const resolved = doc.resolve(position)
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    const node = resolved.node(depth)
    if (node.type.name !== 'list')
      continue
    const blockId = node.attrs.blockId
    if (typeof blockId !== 'string' || blockId.length === 0)
      throw new Error('The active outline block is missing its blockId')
    return {
      blockId,
      offset: position - (resolved.before(depth) + 1),
    }
  }
  throw new Error(`Selection position ${position} is outside an Outline block`)
}

function resolveBlockRelativePosition(doc: ProseMirrorNode, point: BlockRelativePosition): number {
  let resolvedPosition: number | null = null
  doc.descendants((node, position) => {
    if (node.type.name !== 'list' || node.attrs.blockId !== point.blockId)
      return true
    if (point.offset > node.content.size)
      throw new Error(`Selection offset ${point.offset} no longer exists in Outline block ${point.blockId}`)
    resolvedPosition = position + 1 + point.offset
    return false
  })
  if (resolvedPosition === null)
    throw new Error(`Selection Outline block ${point.blockId} no longer exists after Outdent`)
  return resolvedPosition
}

function captureOutlineSelection(state: EditorState): OutlineSelectionBookmark {
  const { selection } = state
  if (selection instanceof AllSelection)
    return { type: 'all' }
  if (selection instanceof TextSelection) {
    return {
      type: 'text',
      anchor: captureBlockRelativePosition(state.doc, selection.anchor),
      head: captureBlockRelativePosition(state.doc, selection.head),
    }
  }
  if (selection instanceof NodeSelection) {
    return {
      type: 'node',
      anchor: captureBlockRelativePosition(state.doc, selection.anchor),
    }
  }
  return {
    type: 'near',
    bias: selection.head >= selection.anchor ? 1 : -1,
    head: captureBlockRelativePosition(state.doc, selection.head),
  }
}

function restoreOutlineSelection(
  transaction: Transaction,
  bookmark: OutlineSelectionBookmark,
): Transaction {
  if (bookmark.type === 'all')
    return transaction.setSelection(new AllSelection(transaction.doc))
  if (bookmark.type === 'node') {
    return transaction.setSelection(NodeSelection.create(
      transaction.doc,
      resolveBlockRelativePosition(transaction.doc, bookmark.anchor),
    ))
  }
  if (bookmark.type === 'near') {
    return transaction.setSelection(Selection.near(
      transaction.doc.resolve(resolveBlockRelativePosition(transaction.doc, bookmark.head)),
      bookmark.bias,
    ))
  }
  return transaction.setSelection(TextSelection.create(
    transaction.doc,
    resolveBlockRelativePosition(transaction.doc, bookmark.anchor),
    resolveBlockRelativePosition(transaction.doc, bookmark.head),
  ))
}

export function outlineOutdentBlockedMessage(reason: OutdentBlockedReason): string {
  return ({
    empty_selection: 'Select a block before using Outdent.',
    unknown_selected_block: 'The selected block is no longer in the document.',
    already_at_root: 'Top-level blocks cannot be outdented.',
    crosses_focus_root: 'This block cannot move outside the current Focus view.',
    traditional_requires_same_parent: TRADITIONAL_SELECTION_MESSAGE,
    traditional_requires_contiguous_siblings: TRADITIONAL_SELECTION_MESSAGE,
  } as const)[reason]
}

function currentBlockId(state: EditorState): string | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'list')
      continue
    const blockId = node.attrs.blockId
    if (typeof blockId !== 'string' || blockId.length === 0)
      throw new Error('The active outline block is missing its blockId')
    return blockId
  }
  return null
}

export function outlineCommandBlockIds(state: EditorState, snapshot: OutlineRuntimeSnapshot): string[] {
  if (snapshot.selectedBlockIds.length > 0)
    return [...snapshot.selectedBlockIds]
  const activeBlockId = currentBlockId(state)
  return activeBlockId ? [activeBlockId] : []
}

export function planOutlineOutdent(
  state: EditorState,
  snapshot: OutlineRuntimeSnapshot,
): OutdentResult {
  return planOutdent(state.doc.toJSON(), outlineCommandBlockIds(state, snapshot), {
    behavior: snapshot.outdentBehavior,
    viewRootId: snapshot.focusBlockId,
  })
}

function executeOutlineOutdentForSnapshot(
  state: EditorState,
  dispatch: (transaction: Transaction) => void,
  runtime: OutlineRuntime,
  snapshot: OutlineRuntimeSnapshot,
  blockIds: readonly string[],
): OutdentResult {
  const result = planOutdent(state.doc.toJSON(), blockIds, {
    behavior: snapshot.outdentBehavior,
    viewRootId: snapshot.focusBlockId,
  })
  if (result.status === 'blocked') {
    runtime.setCommandMessage(outlineOutdentBlockedMessage(result.reason))
    return result
  }

  runtime.setCommandMessage(null)
  const selectionBookmark = captureOutlineSelection(state)
  const nextDocument = state.schema.nodeFromJSON(result.document)
  const transaction = state.tr.replaceWith(0, state.doc.content.size, nextDocument.content)
  dispatch(restoreOutlineSelection(transaction, selectionBookmark).scrollIntoView())
  return result
}

export function executeOutlineOutdentForBlockIds(
  state: EditorState,
  dispatch: (transaction: Transaction) => void,
  runtime: OutlineRuntime,
  blockIds: readonly string[],
): OutdentResult {
  return executeOutlineOutdentForSnapshot(state, dispatch, runtime, runtime.getSnapshot(), blockIds)
}

export function executeOutlineOutdent(
  state: EditorState,
  dispatch: (transaction: Transaction) => void,
  runtime: OutlineRuntime,
): OutdentResult {
  const snapshot = runtime.getSnapshot()
  return executeOutlineOutdentForSnapshot(
    state,
    dispatch,
    runtime,
    snapshot,
    outlineCommandBlockIds(state, snapshot),
  )
}

export function executeOutlineMove(
  state: EditorState,
  dispatch: (transaction: Transaction) => void,
  runtime: OutlineRuntime,
  direction: OutlineMoveDirection,
  blockIds: readonly string[],
): OutlineMoveResult {
  const snapshot = runtime.getSnapshot()
  if (snapshot.focusBlockId && blockIds.includes(snapshot.focusBlockId)) {
    runtime.setCommandMessage('The focused block cannot move.')
    return { reason: 'focus_root', status: 'blocked' }
  }
  const result = planMove(state.doc.toJSON(), blockIds, direction)
  if (result.status === 'blocked') {
    runtime.setCommandMessage(result.reason === 'at_boundary' ? 'The selected block cannot move further.' : null)
    return result
  }

  runtime.setCommandMessage(null)
  const selectionBookmark = captureOutlineSelection(state)
  const nextDocument = state.schema.nodeFromJSON(result.document)
  const transaction = state.tr.replaceWith(0, state.doc.content.size, nextDocument.content)
  dispatch(restoreOutlineSelection(transaction, selectionBookmark).scrollIntoView())
  return result
}
