import type { ReactNode } from 'react'
import { createContext, use, useMemo } from 'react'

interface TableContextType {
  canMerge: boolean
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

export function TableProvider({ children, canMerge}: { children: ReactNode, canMerge: boolean }) {
  const contextValue = useMemo(() => ({
    canMerge,
  }), [canMerge])
  return (
    <TableContext value={contextValue}>
      {children}
    </TableContext>
  )
}
