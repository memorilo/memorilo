import type { Editor } from '@tiptap/core'
import { useMemo } from 'react'
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
        label="Align left"
        Icon={LuAlignLeft}
        onClick={runTableCommand(editor, chain => chain.setCellAttribute('textAlign', 'left'))}
      />
      <IconTooltipButton
        label="Align center"
        Icon={LuAlignCenter}
        onClick={runTableCommand(editor, chain => chain.setCellAttribute('textAlign', 'center'))}
      />
      <IconTooltipButton
        label="Align right"
        Icon={LuAlignRight}
        onClick={runTableCommand(editor, chain => chain.setCellAttribute('textAlign', 'right'))}
      />
      <IconTooltipButton
        label="Insert row above"
        Icon={LuArrowUpToLine}
        onClick={runTableCommand(editor, chain => chain.addRowBefore())}
      />
      <IconTooltipButton
        label="Insert row below"
        Icon={LuArrowDownToLine}
        onClick={runTableCommand(editor, chain => chain.addRowAfter())}
      />
      <IconTooltipButton
        label="Insert column left"
        Icon={LuArrowLeftToLine}
        onClick={runTableCommand(editor, chain => chain.addColumnBefore())}
      />
      <IconTooltipButton
        label="Insert column right"
        Icon={LuArrowRightToLine}
        onClick={runTableCommand(editor, chain => chain.addColumnAfter())}
      />
      {canSplit
        ? (
            <IconTooltipButton
              label="Split cell"
              Icon={LuTableCellsSplit}
              onClick={runTableCommand(editor, chain => chain.splitCell())}
            />
          )
        : null}
      {canMerge
        ? (
            <IconTooltipButton
              label="Merge cells"
              Icon={LuTableCellsMerge}
              onClick={runTableCommand(editor, chain => chain.mergeCells())}
            />
          )
        : null}
    </div>
  )
}
