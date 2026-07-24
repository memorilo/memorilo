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

import { editorStyles } from '../../styles/editor.stylex'

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

  return (
    <TableHandleRoot>
      <TableHandleDragPreview />
      <TableHandleDropIndicator />
      <TableHandleColumnPositioner {...stylex.props(editorStyles.positioner)}>
        <TableHandleColumnPopup {...stylex.props(editorStyles.floatingSurfaceMotion, editorStyles.tableColumnPopup)}>
          <TableHandleColumnMenuRoot>
            <TableHandleColumnMenuTrigger {...stylex.props(editorStyles.tableColumnTrigger)}>
              <GripHorizontal size={20} />
            </TableHandleColumnMenuTrigger>
            <MenuPositioner {...stylex.props(editorStyles.positioner)}>
              <MenuPopup
                {...stylex.props(
                  editorStyles.floatingSurfaceMotion,
                  editorStyles.popupSurface,
                  editorStyles.tableMenuPopup,
                )}
              >
                {state.addTableColumnBefore.canExec && (
                  <MenuItem
                    {...stylex.props(editorStyles.tableMenuItem)}
                    onSelect={state.addTableColumnBefore.command}
                  >
                    <span>Insert Left</span>
                  </MenuItem>
                )}
                {state.addTableColumnAfter.canExec && (
                  <MenuItem
                    {...stylex.props(editorStyles.tableMenuItem)}
                    onSelect={state.addTableColumnAfter.command}
                  >
                    <span>Insert Right</span>
                  </MenuItem>
                )}
                {state.deleteCellSelection.canExec && (
                  <MenuItem
                    {...stylex.props(editorStyles.tableMenuItem)}
                    onSelect={state.deleteCellSelection.command}
                  >
                    <span>Clear Contents</span>
                    <span {...stylex.props(editorStyles.tableMenuShortcut)}>Del</span>
                  </MenuItem>
                )}
                {state.deleteTableColumn.canExec && (
                  <MenuItem
                    {...stylex.props(editorStyles.tableMenuItem)}
                    onSelect={state.deleteTableColumn.command}
                  >
                    <span>Delete Column</span>
                  </MenuItem>
                )}
                {state.deleteTable.canExec && (
                  <MenuItem
                    {...stylex.props(editorStyles.tableMenuItem, editorStyles.dangerMenuItem)}
                    data-danger=""
                    onSelect={state.deleteTable.command}
                  >
                    <span>Delete Table</span>
                  </MenuItem>
                )}
              </MenuPopup>
            </MenuPositioner>
          </TableHandleColumnMenuRoot>
        </TableHandleColumnPopup>
      </TableHandleColumnPositioner>
      <TableHandleRowPositioner
        {...stylex.props(editorStyles.positioner)}
        placement={props.dir === 'rtl' ? 'right' : 'left'}
      >
        <TableHandleRowPopup
          {...stylex.props(
            editorStyles.floatingSurfaceMotion,
            editorStyles.tableRowPopup,
            props.dir === 'rtl' && editorStyles.tableRowPopupRtl,
          )}
        >
          <TableHandleRowMenuRoot>
            <TableHandleRowMenuTrigger {...stylex.props(editorStyles.tableColumnTrigger, editorStyles.tableRowTrigger)}>
              <GripVertical size={20} />
            </TableHandleRowMenuTrigger>
            <MenuPositioner {...stylex.props(editorStyles.positioner)}>
              <MenuPopup
                {...stylex.props(
                  editorStyles.floatingSurfaceMotion,
                  editorStyles.popupSurface,
                  editorStyles.tableMenuPopup,
                )}
              >
                {state.addTableRowAbove.canExec && (
                  <MenuItem
                    {...stylex.props(editorStyles.tableMenuItem)}
                    onSelect={state.addTableRowAbove.command}
                  >
                    <span>Insert Above</span>
                  </MenuItem>
                )}
                {state.addTableRowBelow.canExec && (
                  <MenuItem
                    {...stylex.props(editorStyles.tableMenuItem)}
                    onSelect={state.addTableRowBelow.command}
                  >
                    <span>Insert Below</span>
                  </MenuItem>
                )}
                {state.deleteCellSelection.canExec && (
                  <MenuItem
                    {...stylex.props(editorStyles.tableMenuItem)}
                    onSelect={state.deleteCellSelection.command}
                  >
                    <span>Clear Contents</span>
                    <span {...stylex.props(editorStyles.tableMenuShortcut)}>Del</span>
                  </MenuItem>
                )}
                {state.deleteTableRow.canExec && (
                  <MenuItem
                    {...stylex.props(editorStyles.tableMenuItem)}
                    onSelect={state.deleteTableRow.command}
                  >
                    <span>Delete Row</span>
                  </MenuItem>
                )}
                {state.deleteTable.canExec && (
                  <MenuItem
                    {...stylex.props(editorStyles.tableMenuItem, editorStyles.dangerMenuItem)}
                    data-danger=""
                    onSelect={state.deleteTable.command}
                  >
                    <span>Delete Table</span>
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
