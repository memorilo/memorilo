import type { Editor } from '@tiptap/core'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LuAlignCenter,
  LuAlignLeft,
  LuAlignRight,
  LuArrowDownToLine,
  LuArrowLeftToLine,
  LuArrowRightToLine,
  LuArrowUpToLine,
  LuTableCellsMerge,
  LuTableCellsSplit,
} from 'react-icons/lu'
import { IconTooltipButton } from './icon-tooltip-button'
import { TableSettingsPopover } from './table-menu-settings'
import { getTableContext, isMultiCellSelection } from './table-menu-utils'

type Chain = ReturnType<Editor['chain']>
type TableCommand = (chain: Chain) => Chain

// Ensure focus before executing table commands so the selection is anchored to the active cell.
function runTableCommand(editor: Editor, action: TableCommand) {
  return () => action(editor.chain().focus()).run()
}

interface TableMenuProps {
  editor: Editor
}

export function TableMenu({ editor }: TableMenuProps) {
  const { t } = useTranslation('app')
  const tableContext = useMemo(() => getTableContext(editor.state), [editor.state])
  if (!tableContext) {
    return null
  }

  const canSplit = editor.can().splitCell()
  const canMerge = isMultiCellSelection(editor.state.selection) && editor.can().mergeCells()

  return (
    <div className="flex items-center gap-1">
      <TableSettingsPopover editor={editor} tableContext={tableContext} />
      <IconTooltipButton
        label={t('editor.table.align_left')}
        Icon={LuAlignLeft}
        onClick={runTableCommand(editor, chain => chain.setCellAttribute('textAlign', 'left'))}
      />
      <IconTooltipButton
        label={t('editor.table.align_center')}
        Icon={LuAlignCenter}
        onClick={runTableCommand(editor, chain => chain.setCellAttribute('textAlign', 'center'))}
      />
      <IconTooltipButton
        label={t('editor.table.align_right')}
        Icon={LuAlignRight}
        onClick={runTableCommand(editor, chain => chain.setCellAttribute('textAlign', 'right'))}
      />
      <IconTooltipButton
        label={t('editor.table.insert_row_above')}
        Icon={LuArrowUpToLine}
        onClick={runTableCommand(editor, chain => chain.addRowBefore())}
      />
      <IconTooltipButton
        label={t('editor.table.insert_row_below')}
        Icon={LuArrowDownToLine}
        onClick={runTableCommand(editor, chain => chain.addRowAfter())}
      />
      <IconTooltipButton
        label={t('editor.table.insert_column_left')}
        Icon={LuArrowLeftToLine}
        onClick={runTableCommand(editor, chain => chain.addColumnBefore())}
      />
      <IconTooltipButton
        label={t('editor.table.insert_column_right')}
        Icon={LuArrowRightToLine}
        onClick={runTableCommand(editor, chain => chain.addColumnAfter())}
      />
      {canSplit
        ? (
            <IconTooltipButton
              label={t('editor.table.split_cell')}
              Icon={LuTableCellsSplit}
              onClick={runTableCommand(editor, chain => chain.splitCell())}
            />
          )
        : null}
      {canMerge
        ? (
            <IconTooltipButton
              label={t('editor.table.merge_cells')}
              Icon={LuTableCellsMerge}
              onClick={runTableCommand(editor, chain => chain.mergeCells())}
            />
          )
        : null}
    </div>
  )
}
