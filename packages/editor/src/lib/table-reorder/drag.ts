import type { Editor, Path } from 'slate'
import type { TableColumnDragItem, TableRowDragItem } from './types'
import { cloneDeep } from 'es-toolkit'
import { getColumnGroupRange, getRowGroupInfo, getTableColumnGroupData } from './groups'
import { getCellColumnIndex } from './layout'
import { getRowPathFromCellPath, getTablePathFromCellPath } from './paths'

/**
 * Returns whether the row exists and can participate in grouped reordering.
 */
export function canReorderTableRow(editor: Editor, rowPath: Path): boolean {
  return Boolean(getRowGroupInfo(editor, rowPath))
}

/**
 * Returns whether the column exists and can participate in grouped reordering.
 */
export function canReorderTableColumn(editor: Editor, tablePath: Path, columnIndex: number): boolean {
  const columnContext = getTableColumnGroupData(editor, tablePath, { includeHiddenHead: true })
  if (!columnContext)
    return false

  return Boolean(getColumnGroupRange(columnContext.columnData, columnIndex))
}

/**
 * Builds drag metadata for a row handle at the provided cell path.
 */
export function createRowDragData(editor: Editor, cellPath: Path): TableRowDragItem | null {
  const tablePath = getTablePathFromCellPath(editor, cellPath)
  const rowPath = getRowPathFromCellPath(editor, cellPath)
  if (!tablePath || !rowPath || !canReorderTableRow(editor, rowPath))
    return null

  return {
    tablePath: cloneDeep(tablePath),
    rowPath: cloneDeep(rowPath),
  }
}

/**
 * Builds drag metadata for a column handle at the provided cell path.
 */
export function createColumnDragData(editor: Editor, cellPath: Path): TableColumnDragItem | null {
  const tablePath = getTablePathFromCellPath(editor, cellPath)
  const columnIndex = tablePath ? getCellColumnIndex(editor, cellPath) : null
  if (!tablePath || columnIndex === null || !canReorderTableColumn(editor, tablePath, columnIndex))
    return null

  return {
    tablePath: cloneDeep(tablePath),
    columnIndex,
  }
}
