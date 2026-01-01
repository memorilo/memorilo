import { Match } from 'effect'
import { useCallback, useMemo } from 'react'
import { useSlateSelector } from 'slate-react'
import { TableCursor } from 'slate-table'
import { useTable } from '../elements/table/table-provider'
import { InsertTableToolbarButton } from './insert-table'
import { NormalToolbarButtons } from './normal'
import { TableToolbarButtons } from './table'
import { TableSpanCellToolbarButtons } from './table-span-cell'
import { Toolbar, ToolbarRow } from './toolbar'

export function FormatToolbar() {
  const isInTable = useSlateSelector(useCallback(editor => TableCursor.isInTable(editor), []))
  const { canMerge } = useTable()

  const buttons = useMemo(() =>
    Match.value({
      isInTable,
      canMerge,
    }).pipe(
      Match.when({ isInTable: true, canMerge: true }, () => (
        <ToolbarRow>
          <TableSpanCellToolbarButtons />
          <TableToolbarButtons />
        </ToolbarRow>
      )),
      Match.when({ isInTable: true, canMerge: false }, () => (
        <>
          <ToolbarRow>
            <TableToolbarButtons />
          </ToolbarRow>
          <ToolbarRow>
            <NormalToolbarButtons />
          </ToolbarRow>
        </>
      )),
      Match.orElse(() => (
        <ToolbarRow>
          <NormalToolbarButtons />
          <InsertTableToolbarButton />
        </ToolbarRow>
      )),
    ), [isInTable, canMerge])

  return (
    <Toolbar>
      {buttons}
    </Toolbar>
  )
}
