import type { EditorState, Transaction } from '@tiptap/pm/state'
import { findListItem, isListContainerNode } from '../outline/outline-utils'

type Dispatch = ((tr: Transaction) => void) | undefined

export function toggleOutlineCodeBlock(state: EditorState, dispatch: Dispatch) {
  const listItem = findListItem(state.selection.$from)
  if (!listItem) {
    return false
  }

  const codeBlockType = state.schema.nodes.codeBlock
  let codeBlockPos: number | null = null
  let codeBlockNodeSize = 0
  let insertPos: number | null = null

  listItem.node.forEach((child, offset) => {
    const childPos = listItem.pos + 1 + offset

    if (codeBlockPos === null && child.type === codeBlockType) {
      codeBlockPos = childPos
      codeBlockNodeSize = child.nodeSize
    }

    if (insertPos === null && isListContainerNode(child)) {
      insertPos = childPos
    }
  })

  if (dispatch) {
    const tr = state.tr
    if (codeBlockPos !== null) {
      tr.delete(codeBlockPos, codeBlockPos + codeBlockNodeSize)
    }
    else {
      const targetPos = insertPos ?? (listItem.pos + listItem.node.nodeSize - 1)
      tr.insert(targetPos, codeBlockType!.create())
    }
    dispatch(tr)
  }

  return true
}
