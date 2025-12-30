import type { MouseEvent } from 'react'
import type { TableColumnDragItem, TableRowDragItem } from '../../../lib/table-reorder'
import type { MemoriloEditor } from '../../../slate'
import type { TableSelectableCell } from './table-utils'
import { cn } from '@memorilo/utils'
import { useCallback, useEffect, useMemo } from 'react'
import { useDrag, useDragLayer } from 'react-dnd'
import { Editor, Path, Transforms } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { TableCursor } from 'slate-table'
import {
  isTable,
  isTableCell,
  isTableRow,
} from '../../../lib/element-type'
import {
  createColumnDragData,
  createRowDragData,
  getTablePathFromCellPath,
  TABLE_DND_COLUMN,
  TABLE_DND_ROW,
} from '../../../lib/table-reorder'
import { useTable } from './table-provider'
import { isFirstColumn, isTopRow } from './table-utils'

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
  return getTablePathFromCellPath(editor, cellPath)
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
  const { dragTarget, setDragTarget } = useTable()
  const showHandlers = useSlateSelector(useCallback(
    nextEditor => isSameTableAsSelection(nextEditor, element),
    [element],
  ))
  const cellTablePath = useMemo(() => getCellTablePath(editor, element), [editor, element])
  const { dragItemType, dragItem, isDragging } = useDragLayer(monitor => ({
    dragItemType: monitor.getItemType(),
    dragItem: monitor.getItem(),
    isDragging: monitor.isDragging(),
  }))
  const isDraggingSameTable = useMemo(() => {
    if (!dragItemType || !dragItem || !cellTablePath)
      return false
    if (dragItemType === TABLE_DND_ROW)
      return Path.equals((dragItem as TableRowDragItem).tablePath, cellTablePath)
    if (dragItemType === TABLE_DND_COLUMN)
      return Path.equals((dragItem as TableColumnDragItem).tablePath, cellTablePath)
    return false
  }, [cellTablePath, dragItem, dragItemType])
  const shouldRenderHandles = showHandlers || isDraggingSameTable
  const showColumnHandle = useSlateSelector(useCallback(
    nextEditor => isTopRow(nextEditor, element),
    [element],
  ))
  const showRowHandle = useSlateSelector(useCallback(
    nextEditor => isFirstColumn(nextEditor, element),
    [element],
  ))

  // Use click handlers so dragstart isn't canceled by a prevented mousedown.
  const handleRowClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    selectRow(editor, element)
    ReactEditor.focus(editor)
  }, [editor, element])

  const handleColumnClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    selectColumn(editor, element)
    ReactEditor.focus(editor)
  }, [editor, element])

  const [{ isDragging: isRowDragging }, rowDragRef] = useDrag(() => ({
    type: TABLE_DND_ROW,
    item: () => {
      const cellPath = ReactEditor.findPath(editor, element)
      return createRowDragData(editor, cellPath) ?? { tablePath: [], rowPath: [] }
    },
    canDrag: () => {
      const cellPath = ReactEditor.findPath(editor, element)
      return Boolean(createRowDragData(editor, cellPath))
    },
    collect: monitor => ({
      isDragging: monitor.isDragging(),
    }),
  }), [editor, element])

  const [{ isDragging: isColumnDragging }, columnDragRef] = useDrag(() => ({
    type: TABLE_DND_COLUMN,
    item: () => {
      const cellPath = ReactEditor.findPath(editor, element)
      return createColumnDragData(editor, cellPath) ?? { tablePath: [], columnIndex: 0 }
    },
    canDrag: () => {
      const cellPath = ReactEditor.findPath(editor, element)
      return Boolean(createColumnDragData(editor, cellPath))
    },
    collect: monitor => ({
      isDragging: monitor.isDragging(),
    }),
  }), [editor, element])

  useEffect(() => {
    if (!isDragging && dragTarget)
      setDragTarget(null)
  }, [dragTarget, isDragging, setDragTarget])

  const setRowHandleRef = useCallback((node: HTMLButtonElement | null) => {
    rowDragRef(node)
  }, [rowDragRef])

  const setColumnHandleRef = useCallback((node: HTMLButtonElement | null) => {
    columnDragRef(node)
  }, [columnDragRef])

  // Keep handles available during drag even if Slate clears the selection.
  if (!shouldRenderHandles)
    return null

  return (
    <>
      {showColumnHandle && (
        <button
          type="button"
          tabIndex={-1}
          contentEditable={false}
          aria-label="Select column"
          ref={setColumnHandleRef}
          className={cn(
            'absolute -top-2 left-0 right-0 z-10 h-2 cursor-pointer',
            'flex items-center justify-center opacity-40 transition-opacity hover:opacity-80',
            isColumnDragging && 'opacity-80',
          )}
          onClick={handleColumnClick}
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
          ref={setRowHandleRef}
          className={cn(
            'absolute -left-2 top-0 bottom-0 z-10 w-2 cursor-pointer',
            'flex items-center justify-center opacity-40 transition-opacity hover:opacity-80',
            isRowDragging && 'opacity-80',
          )}
          onClick={handleRowClick}
        >
          <span className="block h-8 w-1 rounded-full bg-slate-400" />
        </button>
      )}
    </>
  )
}
