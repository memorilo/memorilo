import type { Editor } from 'slate'
import type { TableCellLayout, TableRowLayout } from './layout'
import { Array, Option, pipe } from 'effect'
import { Node, Path } from 'slate'
import { getSectionRowLayouts, getTableRowLayouts } from './layout'

/**
 * Inclusive index range describing a grouped set of rows or columns.
 */
export interface TableGroupRange {
  start: number
  end: number
}

function mergeGroupRanges(ranges: TableGroupRange[]): TableGroupRange[] {
  // Merge overlapping span ranges to keep connected rows/columns together.
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged: TableGroupRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (!last || range.start > last.end) {
      merged.push({ ...range })
      continue
    }
    last.end = Math.max(last.end, range.end)
  }
  return merged
}

function getGroupRanges(
  rowLayouts: TableRowLayout[],
  getRange: (cell: TableCellLayout, rowIndex: number) => TableGroupRange | null,
): TableGroupRange[] {
  const ranges: TableGroupRange[] = []
  rowLayouts.forEach((layout, rowIndex) => {
    layout.cells.forEach((cell) => {
      const range = getRange(cell, rowIndex)
      if (range)
        ranges.push(range)
    })
  })
  return mergeGroupRanges(ranges)
}

function getGroupRangeForIndex(ranges: TableGroupRange[], index: number): TableGroupRange {
  const match = pipe(
    ranges,
    Array.findFirst(range => index >= range.start && index <= range.end),
    Option.getOrNull,
  )
  return match ?? { start: index, end: index }
}

function getRowGroupRanges(rowLayouts: TableRowLayout[]): TableGroupRange[] {
  // Row groups are the connected components induced by rowSpan intervals.
  return getGroupRanges(rowLayouts, (cell, rowIndex) => {
    if (cell.rowSpan <= 1)
      return null
    return { start: rowIndex, end: rowIndex + cell.rowSpan - 1 }
  })
}

function getColumnGroupRanges(rowLayouts: TableRowLayout[]): TableGroupRange[] {
  // Column groups are the connected components induced by colSpan intervals.
  return getGroupRanges(rowLayouts, (cell) => {
    if (cell.colSpan <= 1)
      return null
    return { start: cell.columnIndex, end: cell.columnIndex + cell.colSpan - 1 }
  })
}

/**
 * Resolves row group metadata for a row path within its table section.
 */
export function getRowGroupInfo(editor: Editor, rowPath: Path) {
  // Row groups are resolved within their section to preserve table structure.
  const sectionPath = Path.parent(rowPath)
  if (!Node.has(editor, sectionPath))
    return null

  const rowLayouts = getSectionRowLayouts(editor, sectionPath)
  const rowIndex = pipe(
    rowLayouts,
    Array.findFirstIndex(layout => Path.equals(layout.rowPath, rowPath)),
    Option.getOrNull,
  )
  if (rowIndex === null)
    return null

  const rowGroupRanges = getRowGroupRanges(rowLayouts)
  const range = getGroupRangeForIndex(rowGroupRanges, rowIndex)

  return {
    sectionPath,
    rowLayouts,
    rowIndex,
    range,
  }
}

/**
 * Computes column grouping metadata for a table layout.
 */
export function getColumnGroupData(rowLayouts: TableRowLayout[]) {
  const columnCount = rowLayouts.reduce(
    (max, layout) => Math.max(
      max,
      layout.cells.reduce((count, cell) => Math.max(count, cell.columnIndex + cell.colSpan), 0),
    ),
    0,
  )

  return {
    columnGroupRanges: getColumnGroupRanges(rowLayouts),
    columnCount,
  }
}

/**
 * Returns the group range that owns a column index, or null if out of bounds.
 */
export function getColumnGroupRange(
  columnData: ReturnType<typeof getColumnGroupData>,
  columnIndex: number,
): TableGroupRange | null {
  if (columnIndex < 0 || columnIndex >= columnData.columnCount)
    return null
  return getGroupRangeForIndex(columnData.columnGroupRanges, columnIndex)
}

function getRowCellsInColumnRange(layout: TableRowLayout, range: TableGroupRange): TableCellLayout[] {
  return layout.cells.filter((cell) => {
    const cellStart = cell.columnIndex
    const cellEnd = cell.columnIndex + cell.colSpan - 1
    return cellEnd >= range.start && cellStart <= range.end
  })
}

/**
 * Returns row-local cell metadata for a column group or null if spans conflict.
 */
export function getRowCellGroupInfo(layout: TableRowLayout, range: TableGroupRange) {
  const cells = getRowCellsInColumnRange(layout, range)
  if (!cells.length)
    return null

  // Bail out if any cell would be partially moved (spans outside the group).
  for (const cell of cells) {
    const cellStart = cell.columnIndex
    const cellEnd = cell.columnIndex + cell.colSpan - 1
    if (cellStart < range.start || cellEnd > range.end)
      return null
  }

  const cellIndices = cells.map(cell => cell.cellIndex)
  return {
    cells,
    startIndex: Math.min(...cellIndices),
    endIndex: Math.max(...cellIndices),
  }
}

/**
 * Returns the insertion index for a column group within a row layout.
 */
export function getRowInsertIndexForRange(layout: TableRowLayout, range: TableGroupRange): number {
  const firstAfter = pipe(
    layout.cells,
    Array.findFirst(cell => cell.columnIndex >= range.start),
    Option.getOrNull,
  )
  return firstAfter ? firstAfter.cellIndex : layout.cells.length
}

/**
 * Returns table layouts and column grouping metadata in one pass.
 */
export function getTableColumnGroupData(
  editor: Editor,
  tablePath: Path,
  { includeHiddenHead = true }: { includeHiddenHead?: boolean } = {},
) {
  const rowLayouts = getTableRowLayouts(editor, tablePath, { includeHiddenHead })
  if (!rowLayouts.length)
    return null

  return {
    rowLayouts,
    columnData: getColumnGroupData(rowLayouts),
  }
}
