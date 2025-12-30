import { cn } from '@memorilo/utils'
import { useCallback } from 'react'
import {
  LuAlignCenter,
  LuAlignLeft,
  LuAlignRight,
  LuArrowDownToLine,
  LuArrowLeftToLine,
  LuArrowRightToLine,
  LuArrowUpToLine,
  LuTableCellsSplit,
  LuTrash2,
} from 'react-icons/lu'
import { TbTableColumn, TbTableOff, TbTableRow } from 'react-icons/tb'
import { useSlateSelector, useSlateStatic } from 'slate-react'
import { TableCursor, TableEditor } from 'slate-table'
import { getTableSelectionAlignment, setTableCellAlignment } from '../../../lib/transforms/table-align'
import { useTable } from '../../elements/table/table-provider'
import {
  ToolbarActionPopover,
  ToolbarActionPopoverContent,
  ToolbarActionPopoverItem,
  ToolbarActionPopoverTrigger,
} from '../action-popover'
import { ToolbarIconButton } from '../icon-button'
import { TableSettingsButton } from './table-settings'

export function TableToolbarButtons() {
  const { canMerge } = useTable()
  const isInTable = useSlateSelector(useCallback(editor => TableCursor.isInTable(editor), []))
  const editor = useSlateStatic()

  return (
    <>
      <TableSettingsButton />
      <TableRowActions disabled={!isInTable} />
      <TableColumnActions disabled={!isInTable} />
      <ToolbarIconButton
        label="Split cells"
        disabled={!isInTable && !canMerge}
        onClick={() => TableEditor.split(editor)}
      >
        <LuTableCellsSplit />
      </ToolbarIconButton>
      <TableAlignmentButtons disabled={!isInTable} />

      <ToolbarIconButton
        label="Remove table"
        onClick={() => TableEditor.removeTable(editor)}
      >
        <TbTableOff className="text-red-500" />
      </ToolbarIconButton>
    </>

  )
}

function TableRowActions({ disabled }: { disabled: boolean }) {
  const editor = useSlateStatic()

  const insertRowAbove = useCallback(() => {
    TableEditor.insertRow(editor, { before: true })
  }, [editor])

  const insertRowBelow = useCallback(() => {
    TableEditor.insertRow(editor, { before: false })
  }, [editor])

  const removeRow = useCallback(() => {
    TableEditor.removeRow(editor)
  }, [editor])

  return (
    <ToolbarActionPopover disabled={disabled}>
      <ToolbarActionPopoverTrigger label="Row actions">
        <TbTableRow />
      </ToolbarActionPopoverTrigger>
      <ToolbarActionPopoverContent>
        <ToolbarActionPopoverItem onSelect={insertRowAbove}>
          <LuArrowUpToLine />
          <span>Insert row above</span>
        </ToolbarActionPopoverItem>
        <ToolbarActionPopoverItem onSelect={insertRowBelow}>
          <LuArrowDownToLine />
          <span>Insert row below</span>
        </ToolbarActionPopoverItem>
        <ToolbarActionPopoverItem onSelect={removeRow} destructive>
          <LuTrash2 />
          <span>Delete row</span>
        </ToolbarActionPopoverItem>
      </ToolbarActionPopoverContent>
    </ToolbarActionPopover>
  )
}

function TableColumnActions({ disabled }: { disabled: boolean }) {
  const editor = useSlateStatic()

  const insertColumnLeft = useCallback(() => {
    TableEditor.insertColumn(editor, { before: true })
  }, [editor])

  const insertColumnRight = useCallback(() => {
    TableEditor.insertColumn(editor, { before: false })
  }, [editor])

  const removeColumn = useCallback(() => {
    TableEditor.removeColumn(editor)
  }, [editor])

  return (
    <ToolbarActionPopover disabled={disabled}>
      <ToolbarActionPopoverTrigger label="Column actions">
        <TbTableColumn />
      </ToolbarActionPopoverTrigger>
      <ToolbarActionPopoverContent>
        <ToolbarActionPopoverItem onSelect={insertColumnLeft}>
          <LuArrowLeftToLine />
          <span>Insert column left</span>
        </ToolbarActionPopoverItem>
        <ToolbarActionPopoverItem onSelect={insertColumnRight}>
          <LuArrowRightToLine />
          <span>Insert column right</span>
        </ToolbarActionPopoverItem>
        <ToolbarActionPopoverItem onSelect={removeColumn} destructive>
          <LuTrash2 />
          <span>Delete column</span>
        </ToolbarActionPopoverItem>
      </ToolbarActionPopoverContent>
    </ToolbarActionPopover>
  )
}

function TableAlignmentButtons({ disabled }: { disabled: boolean }) {
  const editor = useSlateStatic()
  const alignment = useSlateSelector(useCallback(getTableSelectionAlignment, []))

  const alignLeft = useCallback(() => {
    setTableCellAlignment(editor, 'left')
  }, [editor])

  const alignCenter = useCallback(() => {
    setTableCellAlignment(editor, 'center')
  }, [editor])

  const alignRight = useCallback(() => {
    setTableCellAlignment(editor, 'right')
  }, [editor])

  return (
    <>
      <ToolbarIconButton
        label="Align left"
        disabled={disabled}
        onClick={alignLeft}
        className={cn(alignment === 'left' && 'text-blue-600 font-bold')}
      >
        <LuAlignLeft />
      </ToolbarIconButton>
      <ToolbarIconButton
        label="Align center"
        disabled={disabled}
        onClick={alignCenter}
        className={cn(alignment === 'center' && 'text-blue-600 font-bold')}
      >
        <LuAlignCenter />
      </ToolbarIconButton>
      <ToolbarIconButton
        label="Align right"
        disabled={disabled}
        onClick={alignRight}
        className={cn(alignment === 'right' && 'text-blue-600 font-bold')}
      >
        <LuAlignRight />
      </ToolbarIconButton>
    </>
  )
}
