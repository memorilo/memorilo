import type { MouseEvent } from 'react'
import type { MemoriloEditor, TableCellElementType, TableHeaderCellElementType } from '../../../slate'
import { cn } from '@memorilo/utils'
import { useCallback } from 'react'
import { Editor, Node, Path, Transforms } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { TableCursor } from 'slate-table'
import {
  isHiddenTableHead,
  isTable,
  isTableCell,
  isTableRow,
  isTableSection,
} from '../../../lib/element-type'

type TableSelectableCell = TableCellElementType | TableHeaderCellElementType

function getSelectionTablePath(editor: MemoriloEditor): Path | null {
  if (!editor.selection)
    return null

  const tableEntry = Editor.above(editor, {
    at: editor.selection,
    match: node => isTable(node),
  })

  return tableEntry ? tableEntry[1] : null
}

function getCellTablePath(editor: MemoriloEditor, element: TableSelectableCell): Path | null {
  const cellPath = ReactEditor.findPath(editor, element)
  const tableEntry = Editor.above(editor, {
    at: cellPath,
    match: node => isTable(node),
  })

  return tableEntry ? tableEntry[1] : null
}

function isSameTableAsSelection(editor: MemoriloEditor, element: TableSelectableCell): boolean {
  if (!TableCursor.isInTable(editor))
    return false

  const selectionTablePath = getSelectionTablePath(editor)
  const cellTablePath = getCellTablePath(editor, element)

  if (!selectionTablePath || !cellTablePath)
    return false

  return Path.equals(selectionTablePath, cellTablePath)
}

function isFirstColumn(editor: MemoriloEditor, element: TableSelectableCell): boolean {
  const cellPath = ReactEditor.findPath(editor, element)
  return cellPath[cellPath.length - 1] === 0
}

function getFirstVisibleRowPath(editor: MemoriloEditor, tablePath: Path): Path | null {
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

function isTopRow(editor: MemoriloEditor, element: TableSelectableCell): boolean {
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

function getCellEntryAtSelection(editor: MemoriloEditor) {
  if (!editor.selection)
    return null
  return Editor.above(editor, {
    at: editor.selection,
    match: node => isTableCell(node),
  })
}

function selectRow(editor: MemoriloEditor, element: TableSelectableCell) {
  const cellPath = ReactEditor.findPath(editor, element)
  const rowEntry = Editor.above(editor, {
    at: cellPath,
    match: node => isTableRow(node),
  })
  if (!rowEntry)
    return

  const [rowNode, rowPath] = rowEntry
  if (!isTableRow(rowNode))
    return

  const lastCellIndex = rowNode.children.length - 1
  if (lastCellIndex < 0)
    return

  const firstCellPath = [...rowPath, 0]
  const lastCellPath = [...rowPath, lastCellIndex]

  Transforms.select(editor, {
    anchor: Editor.start(editor, firstCellPath),
    focus: Editor.end(editor, lastCellPath),
  })
}

function selectColumn(editor: MemoriloEditor, element: TableSelectableCell) {
  const cellPath = ReactEditor.findPath(editor, element)
  Transforms.select(editor, cellPath)

  if (!TableCursor.isInTable(editor))
    return

  while (!TableCursor.isInFirstRow(editor)) {
    if (!TableCursor.upward(editor, { mode: 'all' }))
      break
  }

  const topEntry = getCellEntryAtSelection(editor)
  if (!topEntry)
    return

  const [, topPath] = topEntry

  while (!TableCursor.isInLastRow(editor)) {
    if (!TableCursor.downward(editor, { mode: 'all' }))
      break
  }

  const bottomEntry = getCellEntryAtSelection(editor)
  if (!bottomEntry)
    return

  const [, bottomPath] = bottomEntry

  Transforms.select(editor, {
    anchor: Editor.start(editor, topPath),
    focus: Editor.end(editor, bottomPath),
  })
}

export function TableCellSelectionHandles({ element }: { element: TableSelectableCell }) {
  const editor = useSlateStatic()
  const showHandlers = useSlateSelector(useCallback(
    nextEditor => isSameTableAsSelection(nextEditor, element),
    [element],
  ))
  const showColumnHandle = useSlateSelector(useCallback(
    nextEditor => isTopRow(nextEditor, element),
    [element],
  ))
  const showRowHandle = useSlateSelector(useCallback(
    nextEditor => isFirstColumn(nextEditor, element),
    [element],
  ))

  const handleRowMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    selectRow(editor, element)
    ReactEditor.focus(editor)
  }, [editor, element])

  const handleColumnMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    selectColumn(editor, element)
    ReactEditor.focus(editor)
  }, [editor, element])

  if (!showHandlers)
    return null

  return (
    <>
      {showColumnHandle && (
        <button
          type="button"
          tabIndex={-1}
          contentEditable={false}
          aria-label="Select column"
          className={cn(
            'absolute -top-2 left-0 right-0 z-10 h-2 cursor-pointer',
            'flex items-center justify-center opacity-40 transition-opacity hover:opacity-80',
          )}
          onMouseDown={handleColumnMouseDown}
        >
          <span className="block h-1 w-8 rounded-full bg-slate-400" />
        </button>
      )}
      {showRowHandle && (
        <button
          type="button"
          tabIndex={-1}
          contentEditable={false}
          aria-label="Select row"
          className={cn(
            'absolute -left-2 top-0 bottom-0 z-10 w-2 cursor-pointer',
            'flex items-center justify-center opacity-40 transition-opacity hover:opacity-80',
          )}
          onMouseDown={handleRowMouseDown}
        >
          <span className="block h-8 w-1 rounded-full bg-slate-400" />
        </button>
      )}
    </>
  )
}
