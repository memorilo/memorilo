'use client'

import type { Editor } from 'prosekit/core'
import type { TableExtension } from 'prosekit/extensions/table'
import * as stylex from '@stylexjs/stylex'
import { GripHorizontal, GripVertical } from 'lucide-react'
import { useEditorDerivedValue } from 'prosekit/react'
import { MenuItem, MenuPopup, MenuPositioner } from 'prosekit/react/menu'
import {
  TableHandleColumnMenuRoot,
  TableHandleColumnMenuTrigger,
  TableHandleColumnPopup,
  TableHandleColumnPositioner,
  TableHandleDragPreview,
  TableHandleDropIndicator,
  TableHandleRoot,
  TableHandleRowMenuRoot,
  TableHandleRowMenuTrigger,
  TableHandleRowPopup,
  TableHandleRowPositioner,
} from 'prosekit/react/table-handle'
import { useTranslation } from 'react-i18next'

import { floatingSurfaceStyles } from '../floating-surface/floating-surface.stylex'
import { tableHandleStyles } from './table-handle.stylex'

function getTableHandleState(editor: Editor<TableExtension>) {
  return {
    addTableColumnBefore: {
      canExec: editor.commands.addTableColumnBefore.canExec(),
      command: () => editor.commands.addTableColumnBefore(),
    },
    addTableColumnAfter: {
      canExec: editor.commands.addTableColumnAfter.canExec(),
      command: () => editor.commands.addTableColumnAfter(),
    },
    deleteCellSelection: {
      canExec: editor.commands.deleteCellSelection.canExec(),
      command: () => editor.commands.deleteCellSelection(),
    },
    deleteTableColumn: {
      canExec: editor.commands.deleteTableColumn.canExec(),
      command: () => editor.commands.deleteTableColumn(),
    },
    addTableRowAbove: {
      canExec: editor.commands.addTableRowAbove.canExec(),
      command: () => editor.commands.addTableRowAbove(),
    },
    addTableRowBelow: {
      canExec: editor.commands.addTableRowBelow.canExec(),
      command: () => editor.commands.addTableRowBelow(),
    },
    deleteTableRow: {
      canExec: editor.commands.deleteTableRow.canExec(),
      command: () => editor.commands.deleteTableRow(),
    },
    deleteTable: {
      canExec: editor.commands.deleteTable.canExec(),
      command: () => editor.commands.deleteTable(),
    },
  }
}

interface Props {
  dir?: 'ltr' | 'rtl'
}

export default function TableHandle(props: Props) {
  const state = useEditorDerivedValue(getTableHandleState)
  const { t } = useTranslation('editor')

  return (
    <TableHandleRoot>
      <TableHandleDragPreview />
      <TableHandleDropIndicator />
      <TableHandleColumnPositioner {...stylex.props(floatingSurfaceStyles.positioner)}>
        <TableHandleColumnPopup {...stylex.props(floatingSurfaceStyles.motion, tableHandleStyles.columnPopup)}>
          <TableHandleColumnMenuRoot>
            <TableHandleColumnMenuTrigger {...stylex.props(tableHandleStyles.trigger)}>
              <GripHorizontal size={20} />
            </TableHandleColumnMenuTrigger>
            <MenuPositioner {...stylex.props(floatingSurfaceStyles.positioner)}>
              <MenuPopup
                {...stylex.props(
                  floatingSurfaceStyles.motion,
                  floatingSurfaceStyles.surface,
                  tableHandleStyles.menuPopup,
                )}
              >
                {state.addTableColumnBefore.canExec && (
                  <MenuItem
                    {...stylex.props(tableHandleStyles.menuItem)}
                    onSelect={state.addTableColumnBefore.command}
                  >
                    <span>{t('ui.insertLeft')}</span>
                  </MenuItem>
                )}
                {state.addTableColumnAfter.canExec && (
                  <MenuItem
                    {...stylex.props(tableHandleStyles.menuItem)}
                    onSelect={state.addTableColumnAfter.command}
                  >
                    <span>{t('ui.insertRight')}</span>
                  </MenuItem>
                )}
                {state.deleteCellSelection.canExec && (
                  <MenuItem
                    {...stylex.props(tableHandleStyles.menuItem)}
                    onSelect={state.deleteCellSelection.command}
                  >
                    <span>{t('ui.clearContents')}</span>
                    <span {...stylex.props(tableHandleStyles.shortcut)}>{t('ui.del')}</span>
                  </MenuItem>
                )}
                {state.deleteTableColumn.canExec && (
                  <MenuItem
                    {...stylex.props(tableHandleStyles.menuItem)}
                    onSelect={state.deleteTableColumn.command}
                  >
                    <span>{t('ui.deleteColumn')}</span>
                  </MenuItem>
                )}
                {state.deleteTable.canExec && (
                  <MenuItem
                    {...stylex.props(tableHandleStyles.menuItem, tableHandleStyles.dangerItem)}
                    data-danger=""
                    onSelect={state.deleteTable.command}
                  >
                    <span>{t('ui.deleteTable')}</span>
                  </MenuItem>
                )}
              </MenuPopup>
            </MenuPositioner>
          </TableHandleColumnMenuRoot>
        </TableHandleColumnPopup>
      </TableHandleColumnPositioner>
      <TableHandleRowPositioner
        {...stylex.props(floatingSurfaceStyles.positioner)}
        placement={props.dir === 'rtl' ? 'right' : 'left'}
      >
        <TableHandleRowPopup
          {...stylex.props(
            floatingSurfaceStyles.motion,
            tableHandleStyles.rowPopup,
            props.dir === 'rtl' && tableHandleStyles.rowPopupRtl,
          )}
        >
          <TableHandleRowMenuRoot>
            <TableHandleRowMenuTrigger {...stylex.props(tableHandleStyles.trigger, tableHandleStyles.rowTrigger)}>
              <GripVertical size={20} />
            </TableHandleRowMenuTrigger>
            <MenuPositioner {...stylex.props(floatingSurfaceStyles.positioner)}>
              <MenuPopup
                {...stylex.props(
                  floatingSurfaceStyles.motion,
                  floatingSurfaceStyles.surface,
                  tableHandleStyles.menuPopup,
                )}
              >
                {state.addTableRowAbove.canExec && (
                  <MenuItem
                    {...stylex.props(tableHandleStyles.menuItem)}
                    onSelect={state.addTableRowAbove.command}
                  >
                    <span>{t('ui.insertAbove')}</span>
                  </MenuItem>
                )}
                {state.addTableRowBelow.canExec && (
                  <MenuItem
                    {...stylex.props(tableHandleStyles.menuItem)}
                    onSelect={state.addTableRowBelow.command}
                  >
                    <span>{t('ui.insertBelow')}</span>
                  </MenuItem>
                )}
                {state.deleteCellSelection.canExec && (
                  <MenuItem
                    {...stylex.props(tableHandleStyles.menuItem)}
                    onSelect={state.deleteCellSelection.command}
                  >
                    <span>{t('ui.clearContents')}</span>
                    <span {...stylex.props(tableHandleStyles.shortcut)}>{t('ui.del')}</span>
                  </MenuItem>
                )}
                {state.deleteTableRow.canExec && (
                  <MenuItem
                    {...stylex.props(tableHandleStyles.menuItem)}
                    onSelect={state.deleteTableRow.command}
                  >
                    <span>{t('ui.deleteRow')}</span>
                  </MenuItem>
                )}
                {state.deleteTable.canExec && (
                  <MenuItem
                    {...stylex.props(tableHandleStyles.menuItem, tableHandleStyles.dangerItem)}
                    data-danger=""
                    onSelect={state.deleteTable.command}
                  >
                    <span>{t('ui.deleteTable')}</span>
                  </MenuItem>
                )}
              </MenuPopup>
            </MenuPositioner>
          </TableHandleRowMenuRoot>
        </TableHandleRowPopup>
      </TableHandleRowPositioner>
    </TableHandleRoot>
  )
}
