import type { Editor } from 'slate'
import { Array, Option, pipe } from 'effect'
import { Node, Path } from 'slate'
import {
  isHiddenTableHead,
  isTableCell,
  isTableRow,
  isTableSection,
} from '../element-type'
import { getRowPathFromCellPath } from './paths'

/**
 * Normalized layout for a table cell with resolved column positioning.
 */
export interface TableCellLayout {
  cellPath: Path
  cellIndex: number
  columnIndex: number
  colSpan: number
  rowSpan: number
}

/**
 * Layout metadata for a table row with resolved cell positions.
 */
export interface TableRowLayout {
  rowPath: Path
  cells: TableCellLayout[]
}

/**
 * Builds row layouts for a single table section, resolving column positions.
 */
export function getSectionRowLayouts(editor: Editor, sectionPath: Path): TableRowLayout[] {
  // Track open row spans so we can resolve the logical column positions per row.
  const rowSpanTracker: number[] = []
  const layouts: TableRowLayout[] = []

  for (const [row, rowPath] of Node.children(editor, sectionPath)) {
    if (!isTableRow(row))
      continue

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

    layouts.push({ rowPath, cells })

    // Decrement the remaining span height as we advance to the next row.
    for (let index = 0; index < rowSpanTracker.length; index += 1) {
      if (rowSpanTracker[index] > 0)
        rowSpanTracker[index] -= 1
    }
  }

  return layouts
}

/**
 * Builds row layouts for every section in a table.
 */
export function getTableRowLayouts(
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
