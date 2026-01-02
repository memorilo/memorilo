import type { Ref, RefObject } from 'react'
import type { RenderElementProps } from 'slate-react'
import type { TableCellElementType, TableHeadElementType, TableHeaderCellElementType } from '../../../slate'
import { cn } from '@memorilo/utils'
import { useCallback } from 'react'
import { Path } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { TableCursor } from 'slate-table'
import { useTableSelectionActive } from '../../../hooks/use-table-selection'
import { getCellColumnIndex, getTablePathFromCellPath } from '../../../lib/table-reorder'
import { useTable } from './table-provider'
import { TableCellSelectionHandles } from './table-selection-handles'
import { useTableDropTarget } from './use-table-drop-target'

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    refs.forEach((ref) => {
      if (!ref)
        return
      if (typeof ref === 'function') {
        ref(node)
      }
      else {
        (ref as RefObject<T | null>).current = node
      }
    })
  }
}

type TableCellContext = { path: Path, columnIndex: number | null } | null

function useTableCellContext(element: TableCellElementType | TableHeaderCellElementType) {
  return useSlateSelector(
    useCallback((nextEditor) => {
      try {
        const path = ReactEditor.findPath(nextEditor, element)
        return {
          path,
          columnIndex: getCellColumnIndex(nextEditor, path),
        }
      }
      catch {
        return null
      }
    }, [element]),
    (prev, next) => {
      if (!prev || !next)
        return prev === next
      return Path.equals(prev.path, next.path) && prev.columnIndex === next.columnIndex
    },
  ) as TableCellContext
}

export function Table(props: RenderElementProps) {
  // Turn the selection generator into a boolean so it stays stable across renders.
  const isSelecting = useTableSelectionActive()

  return (
    <table
      className={
        cn(
          'table-fixed text-center',
          {
            '[&_*::selection]:bg-transparent': isSelecting,
          },
        )
      }
      {...props.attributes}
    >
      {props.children}
    </table>
  )
}

export function TableHead(props: RenderElementProps) {
  const element = props.element as TableHeadElementType & { hidden?: boolean }

  return (
    <thead
      {...props.attributes}
      className={cn(
        'border-b text-sm bg-slate-100',
        {
          hidden: element.hidden,
        },
      )}
    >
      {props.children}
    </thead>
  )
}

export function TableBody(props: RenderElementProps) {
  return (
    <tbody
      {...props.attributes}
      className="border-b text-sm"
    >
      {props.children}
    </tbody>
  )
}

export function TableFooter(props: RenderElementProps) {
  return (
    <tfoot
      {...props.attributes}
    >
      {props.children}
    </tfoot>
  )
}

export function TableRow(props: RenderElementProps) {
  return (
    <tr {...props.attributes}>
      {props.children}
    </tr>
  )
}

export function TableHeaderCell(props: RenderElementProps) {
  const element = props.element as TableHeaderCellElementType
  const editor = useSlateStatic()
  const { dragTarget } = useTable()
  const selected = useSlateSelector(editor => TableCursor.isSelected(editor, element))
  const dropRef = useTableDropTarget(element)
  const { ref: slateRef, ...attributes } = props.attributes
  const composedRef = useCallback(mergeRefs<HTMLTableCellElement>(slateRef, dropRef), [dropRef, slateRef])
  const cellContext = useTableCellContext(element)
  const cellPath = cellContext?.path ?? null
  const columnIndex = cellContext?.columnIndex ?? null
  const tablePath = cellPath ? getTablePathFromCellPath(editor, cellPath) : null
  const isRowTarget = Boolean(
    dragTarget?.type === 'row'
    && tablePath
    && cellPath
    && Path.equals(dragTarget.tablePath, tablePath)
    && Path.equals(dragTarget.rowPath, Path.parent(cellPath)),
  )
  const isColumnTarget = Boolean(
    dragTarget?.type === 'column'
    && tablePath
    && columnIndex !== null
    && Path.equals(dragTarget.tablePath, tablePath)
    && dragTarget.columnIndex === columnIndex,
  )
  const dragHighlight = (isRowTarget || isColumnTarget) && !selected

  return (
    <th
      rowSpan={element.rowSpan}
      colSpan={element.colSpan}
      className={cn(
        {
          'bg-sky-200': selected,
          'opacity-70': dragHighlight,
          'text-left': element.align === 'left',
          'text-center': element.align === 'center',
          'text-right': element.align === 'right',
        },
        'relative border border-gray-400 p-2 align-middle transition-opacity overflow-visible',
      )}
      ref={composedRef}
      {...attributes}
    >
      <TableCellSelectionHandles element={element} />
      {props.children}
    </th>
  )
}

export function TableCell(props: RenderElementProps) {
  const element = props.element as TableCellElementType
  const editor = useSlateStatic()
  const { dragTarget } = useTable()
  const selected = useSlateSelector(editor => TableCursor.isSelected(editor, element))
  const dropRef = useTableDropTarget(element)
  const { ref: slateRef, ...attributes } = props.attributes
  const composedRef = useCallback(mergeRefs<HTMLTableCellElement>(slateRef, dropRef), [dropRef, slateRef])
  const cellContext = useTableCellContext(element)
  const cellPath = cellContext?.path ?? null
  const columnIndex = cellContext?.columnIndex ?? null
  const tablePath = cellPath ? getTablePathFromCellPath(editor, cellPath) : null
  const isRowTarget = Boolean(
    dragTarget?.type === 'row'
    && tablePath
    && cellPath
    && Path.equals(dragTarget.tablePath, tablePath)
    && Path.equals(dragTarget.rowPath, Path.parent(cellPath)),
  )
  const isColumnTarget = Boolean(
    dragTarget?.type === 'column'
    && tablePath
    && columnIndex !== null
    && Path.equals(dragTarget.tablePath, tablePath)
    && dragTarget.columnIndex === columnIndex,
  )
  const dragHighlight = (isRowTarget || isColumnTarget) && !selected

  return (
    <td
      rowSpan={element.rowSpan}
      colSpan={element.colSpan}
      className={cn(
        {
          'bg-sky-200': selected,
          'opacity-70': dragHighlight,
          'text-left': element.align === 'left',
          'text-center': element.align === 'center',
          'text-right': element.align === 'right',
        },
        'relative border border-gray-400 p-2 align-middle transition-opacity overflow-visible',
      )}
      ref={composedRef}
      {...attributes}
    >
      <TableCellSelectionHandles element={element} />
      {props.children}
    </td>
  )
}
