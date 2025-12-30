import { useCallback } from 'react'
import { LuGrid2X2X, LuTableCellsSplit } from 'react-icons/lu'
import { useSlateSelector, useSlateStatic } from 'slate-react'
import { TableCursor, TableEditor } from 'slate-table'
import { useTable } from '../../elements/table/table-provider'
import { UtilButton } from '../../util-button'
import { TableSettingsButton } from './table-settings'

export function TableToolbarButtons() {
  const { canMerge } = useTable()
  const isInTable = useSlateSelector(useCallback(editor => TableCursor.isInTable(editor), []))
  const editor = useSlateStatic()

  return (
    <>
      <TableSettingsButton />

      <UtilButton
        disabled={!isInTable && !canMerge}
        onClick={() => TableEditor.split(editor)}
      >
        <LuTableCellsSplit />
      </UtilButton>
      <UtilButton
        onClick={() => TableEditor.removeTable(editor)}
      >
        <LuGrid2X2X className="text-red-500" />
      </UtilButton>
    </>

  )
}
