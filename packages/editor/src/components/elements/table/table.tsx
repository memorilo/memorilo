import type { Ref, RefObject } from 'react'
import type { RenderElementProps } from 'slate-react'
import type { TableCellElementType, TableHeadElementType, TableHeaderCellElementType } from '../../../slate'
import { cn } from '@memorilo/utils'
import { useCallback } from 'react'
import { Path } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { TableCursor } from 'slate-table'
import { useTableSelectionActive } from '../../../hooks/use-table-selection'
import { getTablePathFromCellPath } from '../../../lib/table-reorder'
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

export function Table(props: RenderElementProps) {
  // Turn the selection generator into a boolean so it stays stable across renders.
  const isSelecting = useTableSelectionActive()

  return (
    <table
      className={
        cn(
          'table-fixed text-center',
          {
            '[&_*::selection]:bg-none': isSelecting,
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
  if (element.hidden)
    return null

  return (
    <thead
      {...props.attributes}
      className="border-b text-sm bg-slate-100"
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
  const cellPath = useSlateSelector(
    useCallback((nextEditor) => {
      try {
        return ReactEditor.findPath(nextEditor, element)
      }
      catch {
        return null
      }
    }, [element]),
    (prev, next) => {
      if (prev && next)
        return Path.equals(prev, next)
      return prev === next
    },
  )
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
    && cellPath
    && Path.equals(dragTarget.tablePath, tablePath)
    && dragTarget.columnIndex === cellPath[cellPath.length - 1],
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
  const cellPath = useSlateSelector(
    useCallback((nextEditor) => {
      try {
        return ReactEditor.findPath(nextEditor, element)
      }
      catch {
        return null
      }
    }, [element]),
    (prev, next) => {
      if (prev && next)
        return Path.equals(prev, next)
      return prev === next
    },
  )
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
    && cellPath
    && Path.equals(dragTarget.tablePath, tablePath)
    && dragTarget.columnIndex === cellPath[cellPath.length - 1],
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
