import type { EditorState, Transaction } from '@tiptap/pm/state'
import {
  findListItem,
  getLeadingEmptyParagraphRange,
  isEmptyOutlineParagraph,
  isListContainerNode,
} from '../outline/outline-utils'

type Dispatch = ((tr: Transaction) => void) | undefined

function removeTrailingEmptyParagraph(
  tr: Transaction,
  codeBlockPos: number,
) {
  const mappedPos = tr.mapping.map(codeBlockPos, -1)
  const codeBlockNode = tr.doc.nodeAt(mappedPos)
  if (!codeBlockNode || codeBlockNode.type.name !== 'codeBlock') {
    return
  }

  const listItem = findListItem(tr.doc.resolve(mappedPos))
  if (!listItem) {
    return
  }

  const listItemEnd = listItem.pos + listItem.node.nodeSize - 1
  const afterPos = mappedPos + codeBlockNode.nodeSize
  if (afterPos >= listItemEnd) {
    return
  }

  const nextNode = tr.doc.nodeAt(afterPos)
  if (nextNode && isEmptyOutlineParagraph(nextNode)) {
    tr.delete(afterPos, afterPos + nextNode.nodeSize)
  }
}

export function toggleOutlineCodeBlock(state: EditorState, dispatch: Dispatch) {
  const listItem = findListItem(state.selection.$from)
  if (!listItem) {
    return false
  }

  const codeBlockType = state.schema.nodes.codeBlock
  let codeBlockPos: number | null = null
  let codeBlockNodeSize = 0
  let insertPos: number | null = null
  let insertedCodeBlockPos: number | null = null
  const leadingEmptyParagraphRange = getLeadingEmptyParagraphRange(state.selection.$from)

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
      if (leadingEmptyParagraphRange !== null) {
        tr.replaceWith(
          leadingEmptyParagraphRange.from,
          leadingEmptyParagraphRange.to,
          codeBlockType!.create(),
        )
        insertedCodeBlockPos = leadingEmptyParagraphRange.from
      }
      else {
        const targetPos = insertPos ?? (listItem.pos + listItem.node.nodeSize - 1)
        tr.insert(targetPos, codeBlockType!.create())
        insertedCodeBlockPos = targetPos
      }
    }

    if (insertedCodeBlockPos !== null) {
      removeTrailingEmptyParagraph(tr, insertedCodeBlockPos)
    }
    dispatch(tr)
  }

  return true
}
