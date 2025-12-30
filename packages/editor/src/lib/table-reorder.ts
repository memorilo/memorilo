import { Editor, Node, Path, Transforms } from 'slate'
import {
  isTable,
  isTableCell,
  isTableRow,
  isTableSection,
} from './element-type'

export const TABLE_DND_ROW = 'memorilo-table-row'
export const TABLE_DND_COLUMN = 'memorilo-table-column'

export interface TableRowDragItem {
  tablePath: Path
  rowPath: Path
}

export interface TableColumnDragItem {
  tablePath: Path
  columnIndex: number
}

export function getTablePathFromCellPath(editor: Editor, cellPath: Path): Path | null {
  const tableEntry = Editor.above(editor, {
    at: cellPath,
    match: node => isTable(node),
  })
  return tableEntry ? tableEntry[1] : null
}

export function getRowPathFromCellPath(editor: Editor, cellPath: Path): Path | null {
  const rowEntry = Editor.above(editor, {
    at: cellPath,
    match: node => isTableRow(node),
  })
  return rowEntry ? rowEntry[1] : null
}

export function createRowDragData(editor: Editor, cellPath: Path): TableRowDragItem | null {
  const tablePath = getTablePathFromCellPath(editor, cellPath)
  const rowPath = getRowPathFromCellPath(editor, cellPath)

  if (!tablePath || !rowPath)
    return null

  return { tablePath, rowPath }
}

export function createColumnDragData(editor: Editor, cellPath: Path): TableColumnDragItem | null {
  const tablePath = getTablePathFromCellPath(editor, cellPath)
  if (!tablePath)
    return null

  return { tablePath, columnIndex: cellPath[cellPath.length - 1] }
}

export function moveTableRow(editor: Editor, sourceRowPath: Path, targetRowPath: Path) {
  const nextPath = getMovedRowPath(sourceRowPath, targetRowPath)
  if (!nextPath || Path.equals(sourceRowPath, nextPath))
    return

  Transforms.moveNodes(editor, {
    at: sourceRowPath,
    to: nextPath,
  })
}

export function getMovedRowPath(sourceRowPath: Path, targetRowPath: Path): Path | null {
  if (!Path.isSibling(sourceRowPath, targetRowPath))
    return null

  if (Path.equals(sourceRowPath, targetRowPath))
    return sourceRowPath

  // Move to the target path directly to enable swapping adjacent rows.
  return targetRowPath
}

function tableHasSpans(editor: Editor, tablePath: Path): boolean {
  const tableNode = Node.get(editor, tablePath)
  for (const [node] of Node.descendants(tableNode)) {
    if (!isTableCell(node))
      continue
    const rowSpan = node.rowSpan ?? 1
    const colSpan = node.colSpan ?? 1
    if (rowSpan > 1 || colSpan > 1)
      return true
  }
  return false
}

function getRowPaths(editor: Editor, tablePath: Path): Path[] {
  const rows: Path[] = []
  for (const [section, sectionPath] of Node.children(editor, tablePath)) {
    if (!isTableSection(section))
      continue
    for (const [row, rowPath] of Node.children(editor, sectionPath)) {
      if (isTableRow(row))
        rows.push(rowPath)
    }
  }
  return rows
}

export function moveTableColumn(editor: Editor, tablePath: Path, sourceIndex: number, targetIndex: number) {
  if (sourceIndex === targetIndex)
    return

  // Column reordering with merged cells is ambiguous, bail out safely.
  if (tableHasSpans(editor, tablePath))
    return

  const rows = getRowPaths(editor, tablePath)
  if (!rows.length)
    return

  for (const rowPath of rows) {
    const row = Node.get(editor, rowPath)
    if (!row || !('children' in row))
      return
    const cellCount = row.children.length
    if (sourceIndex >= cellCount || targetIndex >= cellCount)
      return
  }

  Editor.withoutNormalizing(editor, () => {
    for (const rowPath of rows) {
      Transforms.moveNodes(editor, {
        at: [...rowPath, sourceIndex],
        to: [...rowPath, targetIndex],
      })
    }
  })
}

export function getMovedColumnIndex(sourceIndex: number, targetIndex: number): number {
  if (sourceIndex === targetIndex)
    return sourceIndex
  return targetIndex
}
