import { useCallback } from 'react'
import { LuTableCellsMerge } from 'react-icons/lu'
import { useSlateSelector, useSlateStatic } from 'slate-react'
import { TableCursor, TableEditor } from 'slate-table'
import { useTable } from '../elements/table/table-provider'
import { UtilButton } from '../util-button'

export function TableSpanCellToolbarButtons() {
  const { canMerge } = useTable()
  const isInTable = useSlateSelector(useCallback(editor => TableCursor.isInTable(editor), []))
  const editor = useSlateStatic()

  return (
    <>

      <UtilButton
        disabled={!isInTable && !canMerge}
        onClick={() => TableEditor.merge(editor)}
        aria-label="Merge Cell"
      >
        <LuTableCellsMerge />
      </UtilButton>
    </>
  )
}
