import { Array, Option, pipe } from 'effect'
import { cloneDeep } from 'es-toolkit'
import { Editor, Node, Path, Transforms } from 'slate'
import {
  isHiddenTableHead,
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

/**
 * Normalized layout for a table cell with resolved column positioning.
 */
interface TableCellLayout {
  cellPath: Path
  cellIndex: number
  columnIndex: number
  colSpan: number
  rowSpan: number
}

/**
 * Layout metadata for a table row, including spans that flow into it.
 */
interface TableRowLayout {
  rowPath: Path
  cells: TableCellLayout[]
  hasIncomingRowSpan: boolean
}

function getSectionRowLayouts(editor: Editor, sectionPath: Path): TableRowLayout[] {
  // Track open row spans so we can resolve the logical column positions per row.
  const rowSpanTracker: number[] = []
  const layouts: TableRowLayout[] = []

  for (const [row, rowPath] of Node.children(editor, sectionPath)) {
    if (!isTableRow(row))
      continue

    const hasIncomingRowSpan = pipe(
      rowSpanTracker,
      Array.findFirst(span => span > 0),
      Option.getOrElse(() => null),
    ) !== null
    const cells: TableCellLayout[] = []
    let columnIndex = 0

    for (const [cell, cellPath] of Node.children(editor, rowPath)) {
      if (!isTableCell(cell))
        continue

      // Skip columns covered by row spans from previous rows.
      while ((rowSpanTracker[columnIndex] ?? 0) > 0)
        columnIndex += 1

      const colSpan = cell.colSpan ?? 1
      const rowSpan = cell.rowSpan ?? 1

      cells.push({
        cellPath,
        cellIndex: cellPath[cellPath.length - 1],
        columnIndex,
        colSpan,
        rowSpan,
      })

      // Mark the span range so following rows can skip covered columns.
      for (let offset = 0; offset < colSpan; offset += 1) {
        const index = columnIndex + offset
        rowSpanTracker[index] = Math.max(rowSpanTracker[index] ?? 0, rowSpan)
      }

      columnIndex += colSpan
    }

    layouts.push({ rowPath, cells, hasIncomingRowSpan })

    // Decrement the remaining span height as we advance to the next row.
    for (let index = 0; index < rowSpanTracker.length; index += 1) {
      if (rowSpanTracker[index] > 0)
        rowSpanTracker[index] -= 1
    }
  }

  return layouts
}

function getTableRowLayouts(
  editor: Editor,
  tablePath: Path,
  { includeHiddenHead = true }: { includeHiddenHead?: boolean } = {},
): TableRowLayout[] {
  const layouts: TableRowLayout[] = []
  for (const [section, sectionPath] of Node.children(editor, tablePath)) {
    if (!isTableSection(section))
      continue
    if (!includeHiddenHead && isHiddenTableHead(section))
      continue
    layouts.push(...getSectionRowLayouts(editor, sectionPath))
  }
  return layouts
}

function getRowLayout(editor: Editor, rowPath: Path): TableRowLayout | null {
  const sectionPath = Path.parent(rowPath)
  if (!Node.has(editor, sectionPath))
    return null
  return pipe(
    getSectionRowLayouts(editor, sectionPath),
    Array.findFirst(layout => Path.equals(layout.rowPath, rowPath)),
    Option.getOrNull,
  )
}

function getCellCoveringColumn(rowLayout: TableRowLayout, columnIndex: number): TableCellLayout | null {
  return pipe(
    rowLayout.cells,
    Array.findFirst((cell) => {
      const endIndex = cell.columnIndex + cell.colSpan
      return columnIndex >= cell.columnIndex && columnIndex < endIndex
    }),
    Option.getOrNull,
  )
}

function getColumnCells(rowLayouts: TableRowLayout[], columnIndex: number): TableCellLayout[] | null {
  const cells: TableCellLayout[] = []
  for (const layout of rowLayouts) {
    const coveringCell = getCellCoveringColumn(layout, columnIndex)
    if (!coveringCell)
      return null
    // A reorderable column must map to a single cell per row with no spans.
    if (coveringCell.columnIndex !== columnIndex)
      return null
    if (coveringCell.colSpan > 1 || coveringCell.rowSpan > 1)
      return null
    cells.push(coveringCell)
  }
  return cells
}

/**
 * Returns the logical column index for a cell path, accounting for spans.
 */
export function getCellColumnIndex(editor: Editor, cellPath: Path): number | null {
  const rowPath = getRowPathFromCellPath(editor, cellPath)
  if (!rowPath)
    return null

  const layout = getRowLayout(editor, rowPath)
  if (!layout)
    return null

  const match = pipe(
    layout.cells,
    Array.findFirst(cell => Path.equals(cell.cellPath, cellPath)),
    Option.getOrNull,
  )
  return match ? match.columnIndex : null
}

/**
 * Returns whether a row can be reordered without intersecting merges.
 */
export function canReorderTableRow(editor: Editor, rowPath: Path): boolean {
  const layout = getRowLayout(editor, rowPath)
  if (!layout)
    return false

  const rowHasMergedCell = pipe(
    layout.cells,
    Array.findFirst(cell => cell.colSpan > 1 || cell.rowSpan > 1),
    Option.getOrElse(() => null),
  ) !== null

  return !(layout.hasIncomingRowSpan || rowHasMergedCell)
}

/**
 * Returns whether a column can be reordered without intersecting merges.
 */
export function canReorderTableColumn(editor: Editor, tablePath: Path, columnIndex: number): boolean {
  const rowLayouts = getTableRowLayouts(editor, tablePath, { includeHiddenHead: true })
  if (!rowLayouts.length)
    return false

  return Boolean(getColumnCells(rowLayouts, columnIndex))
}

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

export function moveTableRow(editor: Editor, sourceRowPath: Path, targetRowPath: Path) {
  if (!canReorderTableRow(editor, sourceRowPath) || !canReorderTableRow(editor, targetRowPath))
    return

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

export function moveTableColumn(editor: Editor, tablePath: Path, sourceIndex: number, targetIndex: number) {
  if (sourceIndex === targetIndex)
    return

  if (
    !canReorderTableColumn(editor, tablePath, sourceIndex)
    || !canReorderTableColumn(editor, tablePath, targetIndex)
  ) {
    return
  }

  const rowLayouts = getTableRowLayouts(editor, tablePath, { includeHiddenHead: true })
  if (!rowLayouts.length)
    return

  const sourceCells = getColumnCells(rowLayouts, sourceIndex)
  const targetCells = getColumnCells(rowLayouts, targetIndex)
  if (!sourceCells || !targetCells)
    return

  // Map each row's source cell to the target index in the same row.
  const moves = sourceCells.map((sourceCell, index) => ({
    from: sourceCell.cellPath,
    toIndex: targetCells[index].cellIndex,
  }))

  Editor.withoutNormalizing(editor, () => {
    for (const move of moves) {
      Transforms.moveNodes(editor, {
        at: move.from,
        to: Path.parent(move.from).concat(move.toIndex),
      })
    }
  })
}

export function getMovedColumnIndex(sourceIndex: number, targetIndex: number): number {
  if (sourceIndex === targetIndex)
    return sourceIndex
  return targetIndex
}
