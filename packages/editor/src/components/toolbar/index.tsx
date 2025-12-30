import { Separator } from '@memorilo/components/ui/separator'
import { Match } from 'effect'
import { useCallback, useMemo } from 'react'
import { useSlateSelector } from 'slate-react'
import { TableCursor } from 'slate-table'
import { useTable } from '../elements/table/table-provider'
import { InsertTableToolbarButton } from './insert-table'
import { NormalToolbarButtons } from './normal'
import { TableToolbarButtons } from './table'
import { TableSpanCellToolbarButtons } from './table-span-cell'
import { Toolbar } from './toolbar'

export function FormatToolbar() {
  const isInTable = useSlateSelector(useCallback(editor => TableCursor.isInTable(editor), []))
  const { canMerge } = useTable()

  const buttons = useMemo(() =>
    Match.value({
      isInTable,
      canMerge,
    }).pipe(
      Match.when({ isInTable: true, canMerge: true }, () => (
        <>
          <TableSpanCellToolbarButtons />
          <TableToolbarButtons />
        </>
      )),
      Match.when({ isInTable: true, canMerge: false }, () => (
        <>
          <TableToolbarButtons />
          <Separator orientation="vertical" />
          <NormalToolbarButtons />
        </>
      )),
      Match.orElse(() => (
        <>
          <NormalToolbarButtons />
          <InsertTableToolbarButton />
        </>
      )),
    ), [isInTable, canMerge])

  return (
    <Toolbar>
      { buttons}
    </Toolbar>
  )
}
