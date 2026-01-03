import type { Editor, Path } from 'slate'
import type { TableCellAlignment, TableCellElementType, TableHeaderCellElementType } from '../../slate'
import { Editor as SlateEditor, Transforms } from 'slate'
import { TableCursor } from 'slate-table'
import { isTableCell } from '../element-type'
import { isTableSelectionActive, restoreTableSelection, snapshotTableSelection } from '../table-selection'

type TableCellEntry = [TableCellElementType | TableHeaderCellElementType, Path]

function getSelectedTableCellEntries(editor: Editor): TableCellEntry[] {
  const entries: TableCellEntry[] = []
  const seen = new Set<string>()

  for (const row of TableCursor.selection(editor)) {
    for (const [cell, path] of row) {
      if (!isTableCell(cell))
        continue
      const key = path.join(',')
      if (seen.has(key))
        continue
      seen.add(key)
      entries.push([cell as TableCellElementType | TableHeaderCellElementType, path])
    }
  }

  if (entries.length === 0 && editor.selection) {
    const entry = SlateEditor.above(editor, {
      at: editor.selection,
      match: node => isTableCell(node),
    })
    if (entry)
      entries.push(entry as TableCellEntry)
  }

  return entries
}

export function getTableSelectionAlignment(editor: Editor): TableCellAlignment | null {
  if (!editor.selection || !TableCursor.isInTable(editor))
    return null

  const entries = getSelectedTableCellEntries(editor)
  if (entries.length === 0)
    return null

  // Cells without explicit alignment inherit the table default (center).
  const resolved = entries.map(([cell]) => cell.align ?? 'center')
  const first = resolved[0]
  return resolved.every(value => value === first) ? first : null
}

export function setTableCellAlignment(editor: Editor, alignment: TableCellAlignment) {
  if (!editor.selection || !TableCursor.isInTable(editor))
    return

  // Prefer the slate-table selection matrix so multi-cell selections update together.
  const entries = getSelectedTableCellEntries(editor)
  if (entries.length === 0)
    return

  const shouldRestoreSelection = isTableSelectionActive(editor)
  const selectionSnapshot = shouldRestoreSelection ? snapshotTableSelection(editor) : null

  SlateEditor.withoutNormalizing(editor, () => {
    for (const [, path] of entries) {
      Transforms.setNodes(editor, { align: alignment }, { at: path })
    }
  })

  if (shouldRestoreSelection)
    restoreTableSelection(editor, selectionSnapshot)
}
