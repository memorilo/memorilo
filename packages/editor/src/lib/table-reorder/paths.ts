import type { Path } from 'slate'
import { Editor } from 'slate'
import { isTable, isTableRow } from '../element-type'

/**
 * Returns the table path that owns the provided cell path.
 */
export function getTablePathFromCellPath(editor: Editor, cellPath: Path): Path | null {
  const tableEntry = Editor.above(editor, {
    at: cellPath,
    match: node => isTable(node),
  })
  return tableEntry ? tableEntry[1] : null
}

/**
 * Returns the row path that owns the provided cell path.
 */
export function getRowPathFromCellPath(editor: Editor, cellPath: Path): Path | null {
  const rowEntry = Editor.above(editor, {
    at: cellPath,
    match: node => isTableRow(node),
  })
  return rowEntry ? rowEntry[1] : null
}
