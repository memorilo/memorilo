import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model'
import { GapCursor } from '@tiptap/pm/gapcursor'
import { NodeSelection } from '@tiptap/pm/state'
import { CellSelection, deleteColumn, deleteRow, rowIsHeader, selectedRect } from '@tiptap/pm/tables'

export const TABLE_DELETE_REQUEST_EVENT = 'memorilo:table-delete-request'

export interface TableDeleteRequestDetail {
  editor: Editor
  tablePos: number
}

function isTableNode(node: ProseMirrorNode | null | undefined) {
  return node?.type.name === 'table' || node?.type.spec.tableRole === 'table'
}

function getAdjacentTablePos($pos: ResolvedPos, direction: 'backward' | 'forward') {
  if (direction === 'backward') {
    const previousNode = $pos.nodeBefore
    if (previousNode == null || !isTableNode(previousNode)) {
      return null
    }

    return $pos.pos - previousNode.nodeSize
  }

  if (!isTableNode($pos.nodeAfter)) {
    return null
  }

  return $pos.pos
}

export function deleteTableAtPos(editor: Editor, tablePos: number) {
  const tableNode = editor.state.doc.nodeAt(tablePos)
  if (tableNode == null || !isTableNode(tableNode)) {
    return false
  }

  editor.view.dispatch(
    editor.state.tr.delete(tablePos, tablePos + tableNode.nodeSize).scrollIntoView(),
  )
  editor.view.focus()
  return true
}

function requestTableDeletion(editor: Editor, tablePos: number) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent<TableDeleteRequestDetail>(TABLE_DELETE_REQUEST_EVENT, {
      cancelable: true,
      detail: {
        editor,
        tablePos,
      },
    })

    const handledByAlert = !window.dispatchEvent(event)
    if (handledByAlert) {
      return true
    }

    // eslint-disable-next-line no-alert -- Fallback confirmation when the editor shell doesn't mount the shared alert host.
    if (window.confirm('Delete this table?')) {
      return deleteTableAtPos(editor, tablePos)
    }

    return true
  }

  return deleteTableAtPos(editor, tablePos)
}

export function handleTableDeleteKey(editor: Editor, direction: 'backward' | 'forward') {
  const { selection } = editor.state

  if (selection instanceof CellSelection) {
    const rect = selectedRect(editor.state)
    const selectsWholeTable = rect.left === 0
      && rect.right === rect.map.width
      && rect.top === 0
      && rect.bottom === rect.map.height

    if (selectsWholeTable) {
      return requestTableDeletion(editor, rect.tableStart - 1)
    }

    if (selection.isRowSelection()) {
      for (let row = rect.top; row < rect.bottom; row += 1) {
        if (rowIsHeader(rect.map, rect.table, row)) {
          return true
        }
      }

      return deleteRow(editor.state, tr => editor.view.dispatch(tr.scrollIntoView()))
    }

    if (selection.isColSelection()) {
      return deleteColumn(editor.state, tr => editor.view.dispatch(tr.scrollIntoView()))
    }

    return false
  }

  if (selection instanceof GapCursor) {
    const tablePos = getAdjacentTablePos(selection.$from, direction)
    if (tablePos == null) {
      return false
    }

    return requestTableDeletion(editor, tablePos)
  }

  if (selection instanceof NodeSelection && isTableNode(selection.node)) {
    return requestTableDeletion(editor, selection.from)
  }

  return false
}
