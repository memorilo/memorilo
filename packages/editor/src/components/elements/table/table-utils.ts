import type { MemoriloEditor, TableCellElementType, TableHeaderCellElementType } from '../../../slate'
import { Editor, Node, Path } from 'slate'
import { ReactEditor } from 'slate-react'
import {
  isHiddenTableHead,
  isTable,
  isTableRow,
  isTableSection,
} from '../../../lib/element-type'

export type TableSelectableCell = TableCellElementType | TableHeaderCellElementType

export function isFirstColumn(editor: MemoriloEditor, element: TableSelectableCell): boolean {
  const cellPath = ReactEditor.findPath(editor, element)
  return cellPath[cellPath.length - 1] === 0
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
