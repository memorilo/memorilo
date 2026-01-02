import { cn } from '@memorilo/utils'
import { useTranslation } from 'react-i18next'
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
import { insertTableColumn, insertTableRow } from '../../elements/table/table-utils'
import {
  ToolbarActionPopover,
  ToolbarActionPopoverContent,
  ToolbarActionPopoverItem,
  ToolbarActionPopoverTrigger,
} from '../action-popover'
import { ToolbarIconButton } from '../icon-button'
import { TableSettingsButton } from './table-settings'

export function TableToolbarButtons() {
  const { t } = useTranslation('app')
  const { canSplit } = useTable()
  const isInTable = useSlateSelector(editor => TableCursor.isInTable(editor))
  const editor = useSlateStatic()

  return (
    <>
      <TableSettingsButton />
      <TableRowActions disabled={!isInTable} />
      <TableColumnActions disabled={!isInTable} />
      <ToolbarIconButton
        label={t('editor.table.toolbar.splitCells')}
        disabled={!canSplit}
        onClick={() => TableEditor.split(editor)}
      >
        <LuTableCellsSplit />
      </ToolbarIconButton>
      <TableAlignmentButtons disabled={!isInTable} />

      <ToolbarIconButton
        label={t('editor.table.toolbar.deleteTitle')}
        onClick={() => TableEditor.removeTable(editor)}
      >
        <TbTableOff className="text-red-500" />
      </ToolbarIconButton>
    </>

  )
}

function TableRowActions({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation('app')
  const editor = useSlateStatic()

  return (
    <ToolbarActionPopover disabled={disabled}>
      <ToolbarActionPopoverTrigger label={t('editor.table.toolbar.rowActions')}>
        <TbTableRow />
      </ToolbarActionPopoverTrigger>
      <ToolbarActionPopoverContent>
        <ToolbarActionPopoverItem onSelect={() => insertTableRow(editor, 'before')}>
          <LuArrowUpToLine />
          <span>{t('editor.table.menu.insertRowAbove')}</span>
        </ToolbarActionPopoverItem>
        <ToolbarActionPopoverItem onSelect={() => insertTableRow(editor, 'after')}>
          <LuArrowDownToLine />
          <span>{t('editor.table.menu.insertRowBelow')}</span>
        </ToolbarActionPopoverItem>
        <ToolbarActionPopoverItem onSelect={() => TableEditor.removeRow(editor)} destructive>
          <LuTrash2 />
          <span>{t('editor.table.menu.deleteRow')}</span>
        </ToolbarActionPopoverItem>
      </ToolbarActionPopoverContent>
    </ToolbarActionPopover>
  )
}

function TableColumnActions({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation('app')
  const editor = useSlateStatic()

  return (
    <ToolbarActionPopover disabled={disabled}>
      <ToolbarActionPopoverTrigger label={t('editor.table.toolbar.columnActions')}>
        <TbTableColumn />
      </ToolbarActionPopoverTrigger>
      <ToolbarActionPopoverContent>
        <ToolbarActionPopoverItem onSelect={() => insertTableColumn(editor, 'before')}>
          <LuArrowLeftToLine />
          <span>{t('editor.table.menu.insertColLeft')}</span>
        </ToolbarActionPopoverItem>
        <ToolbarActionPopoverItem onSelect={() => insertTableColumn(editor, 'after')}>
          <LuArrowRightToLine />
          <span>{t('editor.table.menu.insertColRight')}</span>
        </ToolbarActionPopoverItem>
        <ToolbarActionPopoverItem onSelect={() => TableEditor.removeColumn(editor)} destructive>
          <LuTrash2 />
          <span>{t('editor.table.menu.deleteCol')}</span>
        </ToolbarActionPopoverItem>
      </ToolbarActionPopoverContent>
    </ToolbarActionPopover>
  )
}

function TableAlignmentButtons({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation('app')
  const editor = useSlateStatic()
  const alignment = useSlateSelector(getTableSelectionAlignment)

  return (
    <>
      <ToolbarIconButton
        label={t('editor.table.menu.alignLeft')}
        disabled={disabled}
        onClick={() => setTableCellAlignment(editor, 'left')}
        className={cn(alignment === 'left' && 'text-blue-600 font-bold')}
      >
        <LuAlignLeft />
      </ToolbarIconButton>
      <ToolbarIconButton
        label={t('editor.table.menu.alignCenter')}
        disabled={disabled}
        onClick={() => setTableCellAlignment(editor, 'center')}
        className={cn(alignment === 'center' && 'text-blue-600 font-bold')}
      >
        <LuAlignCenter />
      </ToolbarIconButton>
      <ToolbarIconButton
        label={t('editor.table.menu.alignRight')}
        disabled={disabled}
        onClick={() => setTableCellAlignment(editor, 'right')}
        className={cn(alignment === 'right' && 'text-blue-600 font-bold')}
      >
        <LuAlignRight />
      </ToolbarIconButton>
    </>
  )
}
