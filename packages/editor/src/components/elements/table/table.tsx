import type { RenderElementProps } from 'slate-react'
import type { TableCellElementType, TableHeadElementType, TableHeaderCellElementType } from '../../../slate'
import { cn } from '@memorilo/utils'
import { useSlateSelector } from 'slate-react'
import { TableCursor } from 'slate-table'
import { useTableSelectionActive } from '../../../hooks/use-table-selection'
import { TableCellSelectionHandles } from './table-selection-handles'

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
  const selected = useSlateSelector(editor => TableCursor.isSelected(editor, element))

  return (
    <th
      rowSpan={element.rowSpan}
      colSpan={element.colSpan}
      className={cn(
        {
          'bg-sky-200': selected,
          'text-left': element.align === 'left',
          'text-center': element.align === 'center',
          'text-right': element.align === 'right',
        },
        'relative border border-gray-400 p-2 align-middle',
      )}
      {...props.attributes}
    >
      <TableCellSelectionHandles element={element} />
      {props.children}
    </th>
  )
}

export function TableCell(props: RenderElementProps) {
  const element = props.element as TableCellElementType
  const selected = useSlateSelector(editor => TableCursor.isSelected(editor, element))

  return (
    <td
      rowSpan={element.rowSpan}
      colSpan={element.colSpan}
      className={cn(
        {
          'bg-sky-200': selected,
          'text-left': element.align === 'left',
          'text-center': element.align === 'center',
          'text-right': element.align === 'right',
        },
        'relative border border-gray-400 p-2 align-middle',
      )}
      {...props.attributes}
    >
      <TableCellSelectionHandles element={element} />
      {props.children}
    </td>
  )
}
