import type { PropsWithChildren } from 'react'
import { cn } from '@memorilo/utils'
import { Iterable, Match, Option } from 'effect'
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSlateSelector } from 'slate-react'
import { TableCursor } from 'slate-table'
import { InsertTableToolbarButton } from './insert-table'
import { NormalToolbarButtons } from './normal'
import { TableToolbarButtons } from './table'
import { TableSpanCellToolbarButtons } from './table-span-cell'
import { Toolbar } from './toolbar'

export function FormatToolbar() {
  const isInTable = useSlateSelector(useCallback(editor => TableCursor.isInTable(editor), []))
  const isSpanTable = Iterable.head(useSlateSelector(useCallback(editor => TableCursor.selection(editor), [])))
    .pipe(
      Option.map(() => true),
      Option.getOrElse(() => false),
    )

  const buttons = useMemo(() =>
    Match.value({
      isInTable,
      isSpanTable,
    }).pipe(
      Match.when({ isInTable: true, isSpanTable: true }, () => (
        <>
          <TableSpanCellToolbarButtons />
          <TableToolbarButtons />
        </>
      )),
      Match.when({ isInTable: true, isSpanTable: false }, () => (
        <>
          <NormalToolbarButtons />
          <TableToolbarButtons />
        </>
      )),
      Match.orElse(() => (
        <>
          <NormalToolbarButtons />
          <InsertTableToolbarButton />
        </>
      )),
    ), [isInTable, isSpanTable])

  return (
    <Toolbar>
      { buttons}
    </Toolbar>
  )
}
