import type { MemoriloEditor, TableCellElementType, TableHeaderCellElementType } from '../../../slate'
import { Editor, Node, Path } from 'slate'
import { ReactEditor } from 'slate-react'
import {
  isHiddenTableHead,
  isTable,
  isTableCell,
  isTableRow,
  isTableSection,
} from '../../../lib/element-type'

export type TableSelectableCell = TableCellElementType | TableHeaderCellElementType

function getCellColumnStart(editor: MemoriloEditor, cellPath: Path): number | null {
  const rowEntry = Editor.above(editor, {
    at: cellPath,
    match: node => isTableRow(node),
  })
  if (!rowEntry)
    return null

  const tableEntry = Editor.above(editor, {
    at: rowEntry[1],
    match: node => isTable(node),
  })
  if (!tableEntry)
    return null

  const [, tablePath] = tableEntry
  const rowSpanTracker: number[] = []

  for (const [section, sectionPath] of Node.children(editor, tablePath)) {
    if (!isTableSection(section) || isHiddenTableHead(section))
      continue

    for (const [row, rowPath] of Node.children(editor, sectionPath)) {
      if (!isTableRow(row))
        continue

      let columnIndex = 0
      for (const [cell, currentCellPath] of Node.children(editor, rowPath)) {
        if (!isTableCell(cell))
          continue

        while ((rowSpanTracker[columnIndex] ?? 0) > 0)
          columnIndex += 1

        const colSpan = cell.colSpan ?? 1
        const rowSpan = cell.rowSpan ?? 1

        for (let offset = 0; offset < colSpan; offset += 1) {
          const index = columnIndex + offset
          rowSpanTracker[index] = Math.max(rowSpanTracker[index] ?? 0, rowSpan)
        }

        if (Path.equals(currentCellPath, cellPath))
          return columnIndex

        columnIndex += colSpan
      }

      for (let index = 0; index < rowSpanTracker.length; index += 1) {
        if (rowSpanTracker[index] > 0)
          rowSpanTracker[index] -= 1
      }
    }
  }

  return null
}

export function isFirstColumn(editor: MemoriloEditor, element: TableSelectableCell): boolean {
  const cellPath = ReactEditor.findPath(editor, element)
  const columnIndex = getCellColumnStart(editor, cellPath)
  if (columnIndex === null)
    return cellPath[cellPath.length - 1] === 0
  return columnIndex === 0
}

export function getFirstVisibleRowPath(editor: MemoriloEditor, tablePath: Path): Path | null {
  for (const [section, sectionPath] of Node.children(editor, tablePath)) {
    if (!isTableSection(section))
      continue
    if (isHiddenTableHead(section))
      continue
    for (const [row, rowPath] of Node.children(editor, sectionPath)) {
      if (isTableRow(row))
        return rowPath
    }
  }
  return null
}

export function isTopRow(editor: MemoriloEditor, element: TableSelectableCell): boolean {
  const cellPath = ReactEditor.findPath(editor, element)
  const rowEntry = Editor.above(editor, {
    at: cellPath,
    match: node => isTableRow(node),
  })
  if (!rowEntry)
    return false

  const [, rowPath] = rowEntry
  const tableEntry = Editor.above(editor, {
    at: rowPath,
    match: node => isTable(node),
  })
  if (!tableEntry)
    return false

  const [, tablePath] = tableEntry
  const firstRowPath = getFirstVisibleRowPath(editor, tablePath)

  return Boolean(firstRowPath && Path.equals(rowPath, firstRowPath))
}
