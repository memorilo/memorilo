import type { Editor } from '@tiptap/core'
import type { IconType } from 'react-icons'
import { useEffect, useState } from 'react'
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
import { splitCellPreservingCellTypes } from '../table'
import { IconTooltipButton } from './icon-tooltip-button'
import { TableSettingsPopover } from './table-menu-settings'
import { getTableContext, isMultiCellSelection } from './table-menu-utils'

type Chain = ReturnType<Editor['chain']>
type TableCommand = (chain: Chain) => Chain

interface TableMenuAction {
  id: string
  labelKey: string
  Icon: IconType
  run: TableCommand
  isVisible?: (editor: Editor) => boolean
  isEnabled?: (editor: Editor) => boolean
}

const tableMenuActions: TableMenuAction[] = [
  {
    id: 'align-left',
    labelKey: 'editor.table.align_left',
    Icon: LuAlignLeft,
    run: chain => chain.setCellAttribute('textAlign', 'left'),
    isEnabled: editor => editor.can().chain().focus().setCellAttribute('textAlign', 'left').run(),
  },
  {
    id: 'align-center',
    labelKey: 'editor.table.align_center',
    Icon: LuAlignCenter,
    run: chain => chain.setCellAttribute('textAlign', 'center'),
    isEnabled: editor => editor.can().chain().focus().setCellAttribute('textAlign', 'center').run(),
  },
  {
    id: 'align-right',
    labelKey: 'editor.table.align_right',
    Icon: LuAlignRight,
    run: chain => chain.setCellAttribute('textAlign', 'right'),
    isEnabled: editor => editor.can().chain().focus().setCellAttribute('textAlign', 'right').run(),
  },
  {
    id: 'insert-row-above',
    labelKey: 'editor.table.insert_row_above',
    Icon: LuArrowUpToLine,
    run: chain => chain.addRowBefore(),
    isEnabled: editor => editor.can().chain().focus().addRowBefore().run(),
  },
  {
    id: 'insert-row-below',
    labelKey: 'editor.table.insert_row_below',
    Icon: LuArrowDownToLine,
    run: chain => chain.addRowAfter(),
    isEnabled: editor => editor.can().chain().focus().addRowAfter().run(),
  },
  {
    id: 'insert-column-left',
    labelKey: 'editor.table.insert_column_left',
    Icon: LuArrowLeftToLine,
    run: chain => chain.addColumnBefore(),
    isEnabled: editor => editor.can().chain().focus().addColumnBefore().run(),
  },
  {
    id: 'insert-column-right',
    labelKey: 'editor.table.insert_column_right',
    Icon: LuArrowRightToLine,
    run: chain => chain.addColumnAfter(),
    isEnabled: editor => editor.can().chain().focus().addColumnAfter().run(),
  },
  {
    id: 'split-cell',
    labelKey: 'editor.table.split_cell',
    Icon: LuTableCellsSplit,
    run: chain => chain.command(({ state, dispatch }) => splitCellPreservingCellTypes(state, dispatch)),
    isVisible: editor => editor.can().splitCell(),
    isEnabled: editor => editor.can().chain().focus().command(({ state, dispatch }) =>
      splitCellPreservingCellTypes(state, dispatch)).run(),
  },
  {
    id: 'merge-cells',
    labelKey: 'editor.table.merge_cells',
    Icon: LuTableCellsMerge,
    run: chain => chain.mergeCells(),
    isVisible: editor => isMultiCellSelection(editor.state.selection) && editor.can().mergeCells(),
    isEnabled: editor => editor.can().chain().focus().mergeCells().run(),
  },
]

// Ensure focus before executing table commands so the selection is anchored to the active cell.
function runTableCommand(editor: Editor, action: TableCommand) {
  return () => action(editor.chain().focus()).run()
}

interface TableMenuProps {
  editor: Editor
}

export function TableMenu({ editor }: TableMenuProps) {
  const { t } = useTranslation('app')
  const [, forcePostCommitRefresh] = useState(0)
  const { selection } = editor.state
  const tableContext = getTableContext(editor.state)

  useEffect(() => {
    // WebKit/Tauri can briefly leave the bubble menu on the pre-merge table
    // selection. Re-render once after commit so the controls read the settled
    // post-transaction selection state.
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    forcePostCommitRefresh(value => value + 1)
  }, [selection])

  if (!tableContext) {
    return null
  }

  return (
    <div className="flex items-center gap-1">
      <TableSettingsPopover editor={editor} tableContext={tableContext} />
      {tableMenuActions.map((action) => {
        if (action.isVisible && !action.isVisible(editor)) {
          return null
        }

        return (
          <IconTooltipButton
            key={action.id}
            label={t(action.labelKey)}
            Icon={action.Icon}
            onClick={runTableCommand(editor, action.run)}
            disabled={action.isEnabled ? !action.isEnabled(editor) : false}
            testId={`bubble-table-${action.id}`}
          />
        )
      })}
    </div>
  )
}
