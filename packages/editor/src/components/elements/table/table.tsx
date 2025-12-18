import type { RenderElementProps } from 'slate-react'
import type { TableCellElementType, TableContentElementType, TableHeaderCellElementType } from '../../../slate'
import { cn } from '@memorilo/utils'
import { useMemo, useState } from 'react'
import { Path } from 'slate'
import { ReactEditor, useSlateSelection, useSlateStatic } from 'slate-react'
import { TableCursor } from 'slate-table'
import { TableToolbar } from './table-toolbar'
import './theme-classic.css'

export function Table(props: RenderElementProps) {
  const editor = useSlateStatic()
  const selection = useSlateSelection()
  const [loading, setLoading] = useState(false)
  const tablePath = useMemo(
    () => ReactEditor.findPath(editor, props.element),
    [editor, props.element],
  )

  const isActive = useMemo(() => {
    if (!selection)
      return false
    return (
      Path.isAncestor(tablePath, selection.anchor.path)
      && Path.isAncestor(tablePath, selection.focus.path)
    )
  }, [selection, tablePath])

  const hasTableSelection = useMemo(() => {
    if (!isActive)
      return false
    const iter = TableCursor.selection(editor).next()
    return !iter.done
  }, [editor, isActive, selection])

  return (
    <div className="table-classic-container">
      <div className="table-toolbar-anchor">
        <TableToolbar element={props.element} isActive={isActive} setLoading={setLoading} />
      </div>
      <div className="table-classic-wrapper">
        {loading && (
          <div className="table-loading-overlay">
            <div className="table-loading-spinner" />
          </div>
        )}
        <table
          {...props.attributes}
          className={cn(
            'table-element',
            hasTableSelection ? 'table-no-select' : '',
          )}
        >
          {props.children}
        </table>
      </div>
    </div>
  )
}

export function TableHead(props: RenderElementProps) {
  return (
    <thead
      {...props.attributes}
      className="table-head"
    >
      {props.children}
    </thead>
  )
}

export function TableBody(props: RenderElementProps) {
  return (
    <tbody {...props.attributes} className="table-body">
      {props.children}
    </tbody>
  )
}

export function TableFooter(props: RenderElementProps) {
  return (
    <tfoot
      {...props.attributes}
      className="table-footer"
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
  useSlateSelection()
  const element = props.element as TableHeaderCellElementType
  const align = element.align ?? 'left'

  return (
    <th
      {...props.attributes}
      rowSpan={element.rowSpan}
      colSpan={element.colSpan}
      className={cn(
        'table-header-cell',
        align === 'center' ? 'table-align-center' : align === 'right' ? 'table-align-right' : 'table-align-left',
      )}
    >
      {props.children}
    </th>
  )
}

export function TableCell(props: RenderElementProps) {
  useSlateSelection()
  const element = props.element as TableCellElementType
  const align = element.align ?? 'left'

  return (
    <td
      {...props.attributes}
      rowSpan={element.rowSpan}
      colSpan={element.colSpan}
      className={cn(
        'table-cell',
        align === 'center' ? 'table-align-center' : align === 'right' ? 'table-align-right' : 'table-align-left',
      )}
    >
      {props.children}
    </td>
  )
}

export function TableContent(props: RenderElementProps) {
  const element = props.element as TableContentElementType
  return (
    <div
      {...props.attributes}
      data-type={element.type}
      className="table-content"
    >
      {props.children}
    </div>
  )
}
