import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { CellSelection, TableMap } from '@tiptap/pm/tables'

export interface TableContext {
  tableNode: ProseMirrorNode
  tablePos: number
  map: TableMap
  rows: number
  cols: number
  hasHeaderRow: boolean
}

export function getTableContext(state: EditorState): TableContext | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === 'table' || node.type.spec.tableRole === 'table') {
      const tablePos = $from.before(depth)
      const map = TableMap.get(node)
      const rows = map.height
      const cols = map.width
      const hasHeaderRow = node.childCount > 0 && node.child(0).firstChild?.type.name === 'tableHeader'
      return {
        tableNode: node,
        tablePos,
        map,
        rows,
        cols,
        hasHeaderRow,
      }
    }
  }
  return null
}

export function isMultiCellSelection(selection: EditorState['selection']) {
  return selection instanceof CellSelection
    && selection.$anchorCell.pos !== selection.$headCell.pos
}

export function selectCell(editor: Editor, context: TableContext, row: number, col: number) {
  const safeRow = clamp(row, 0, context.rows - 1)
  const safeCol = clamp(col, 0, context.cols - 1)
  const cellPos = context.map.positionAt(safeRow, safeCol, context.tableNode)
  editor.commands.setTextSelection(context.tablePos + cellPos + 1)
}

export function resizeTable(editor: Editor, targetRows: number, targetCols: number) {
  let context = getTableContext(editor.state)
  if (!context) {
    return
  }

  // Use table commands sequentially because they rely on the current cell selection.
  while (context.rows < targetRows) {
    selectCell(editor, context, context.rows - 1, 0)
    editor.commands.addRowAfter()
    context = getTableContext(editor.state) ?? context
  }

  while (context.rows > targetRows) {
    selectCell(editor, context, context.rows - 1, 0)
    editor.commands.deleteRow()
    context = getTableContext(editor.state) ?? context
  }

  while (context.cols < targetCols) {
    selectCell(editor, context, 0, context.cols - 1)
    editor.commands.addColumnAfter()
    context = getTableContext(editor.state) ?? context
  }

  while (context.cols > targetCols) {
    selectCell(editor, context, 0, context.cols - 1)
    editor.commands.deleteColumn()
    context = getTableContext(editor.state) ?? context
  }
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
