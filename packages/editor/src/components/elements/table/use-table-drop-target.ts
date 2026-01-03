import type { RefCallback } from 'react'
import type { TableColumnDragItem, TableRowDragItem } from '../../../lib/table-reorder'
import type { TableSelectableCell } from './table-utils'
import { useCallback } from 'react'
import { useDrop } from 'react-dnd'
import { Path } from 'slate'
import { ReactEditor, useSlateStatic } from 'slate-react'
import {
  canReorderTableColumn,
  canReorderTableRow,
  getCellColumnIndex,
  getRowPathFromCellPath,
  getTablePathFromCellPath,
  moveTableColumn,
  moveTableRow,
  TABLE_DND_COLUMN,
  TABLE_DND_ROW,
} from '../../../lib/table-reorder'
import { useTable } from './table-provider'

type TableDropItem = TableRowDragItem | TableColumnDragItem

export function useTableDropTarget(element: TableSelectableCell) {
  const editor = useSlateStatic()
  const { setDragTarget } = useTable()
  const getCellContext = useCallback(() => {
    try {
      const cellPath = ReactEditor.findPath(editor, element)
      const tablePath = getTablePathFromCellPath(editor, cellPath)
      const columnIndex = tablePath ? getCellColumnIndex(editor, cellPath) : null
      const rowPath = getRowPathFromCellPath(editor, cellPath)
      return {
        cellPath,
        rowPath,
        tablePath,
        columnIndex,
        canReorderRow: rowPath ? canReorderTableRow(editor, rowPath) : false,
        canReorderColumn: tablePath && columnIndex !== null
          ? canReorderTableColumn(editor, tablePath, columnIndex)
          : false,
      }
    }
    catch {
      return {
        cellPath: null,
        rowPath: null,
        tablePath: null,
        columnIndex: null,
        canReorderRow: false,
        canReorderColumn: false,
      }
    }
  }, [editor, element])
  const [, drop] = useDrop<TableDropItem, void, { isOver: boolean, canDrop: boolean, itemType: string | symbol | null }>(
    () => ({
      accept: [TABLE_DND_ROW, TABLE_DND_COLUMN],
      canDrop: (item, monitor) => {
        const { tablePath, rowPath, columnIndex, canReorderRow, canReorderColumn } = getCellContext()
        const type = monitor.getItemType()
        if (!tablePath)
          return false
        if (type === TABLE_DND_ROW) {
          if (!rowPath || !canReorderRow)
            return false
          if (!canReorderTableRow(editor, (item as TableRowDragItem).rowPath))
            return false
          return Path.equals((item as TableRowDragItem).tablePath, tablePath)
            && Path.isSibling((item as TableRowDragItem).rowPath, rowPath)
        }
        if (type === TABLE_DND_COLUMN) {
          if (columnIndex === null || !canReorderColumn)
            return false
          if (!canReorderTableColumn(editor, tablePath, (item as TableColumnDragItem).columnIndex))
            return false
          return Path.equals((item as TableColumnDragItem).tablePath, tablePath)
        }
        return false
      },
      hover: (_, monitor) => {
        const { tablePath, rowPath, columnIndex } = getCellContext()
        if (!monitor.isOver({ shallow: true }) || !tablePath || !monitor.canDrop())
          return
        const type = monitor.getItemType()
        if (type === TABLE_DND_ROW && rowPath) {
          setDragTarget((current) => {
            if (
              current?.type === 'row'
              && Path.equals(current.tablePath, tablePath)
              && Path.equals(current.rowPath, rowPath)
            ) {
              return current
            }
            return { type: 'row', tablePath, rowPath }
          })
          return
        }
        if (type === TABLE_DND_COLUMN) {
          if (columnIndex === null)
            return
          setDragTarget((current) => {
            if (
              current?.type === 'column'
              && Path.equals(current.tablePath, tablePath)
              && current.columnIndex === columnIndex
            ) {
              return current
            }
            return { type: 'column', tablePath, columnIndex }
          })
        }
      },
      drop: (item, monitor) => {
        const { tablePath, rowPath, columnIndex } = getCellContext()
        if (!monitor.canDrop())
          return
        const type = monitor.getItemType()
        if (type === TABLE_DND_ROW && rowPath && tablePath) {
          moveTableRow(editor, (item as TableRowDragItem).rowPath, rowPath)
          ReactEditor.focus(editor)
          setDragTarget(null)
          return
        }
        if (type === TABLE_DND_COLUMN && tablePath && columnIndex !== null) {
          moveTableColumn(editor, tablePath, (item as TableColumnDragItem).columnIndex, columnIndex)
          ReactEditor.focus(editor)
          setDragTarget(null)
        }
      },
    }),
    [editor, getCellContext, setDragTarget],
  )

  const dropRef = useCallback<RefCallback<HTMLTableCellElement>>((node) => {
    if (node)
      drop(node)
  }, [drop])

  return dropRef
}
