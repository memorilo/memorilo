import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { Path } from 'slate'
import { createContext, use, useMemo, useState } from 'react'

export type TableDragTarget
  = | { type: 'row', tablePath: Path, rowPath: Path }
    | { type: 'column', tablePath: Path, columnIndex: number }
    | null

interface TableContextType {
  canMerge: boolean
  canSplit: boolean
  dragTarget: TableDragTarget
  setDragTarget: Dispatch<SetStateAction<TableDragTarget>>
}
const TableContext = createContext<TableContextType | undefined>(undefined)

// eslint-disable-next-line react-refresh/only-export-components
export function useTable() {
  const table = use(TableContext)
  if (!table) {
    throw new Error('useTable must be used within a TableProvider')
  }
  return table
}

export function TableProvider({ children, canMerge, canSplit }: { children: ReactNode, canMerge: boolean, canSplit: boolean }) {
  const [dragTarget, setDragTarget] = useState<TableDragTarget>(null)
  const contextValue = useMemo(() => ({
    canMerge,
    canSplit,
    dragTarget,
    setDragTarget,
  }), [canMerge, canSplit, dragTarget])
  return (
    <TableContext value={contextValue}>
      {children}
    </TableContext>
  )
}
