import type { ReactNode } from 'react'
import { TreeProvider } from '@memorilo/components/ui/tree'
import { createContext, use, useMemo, useState } from 'react'

interface NodeFolderTreeProviderProps {
  children: ReactNode
}

interface NoteFolderTreeContextValue {
  selectedIds: string[]
  setSelectedIds: (ids: string[]) => void
}

const NoteFolderTreeContext = createContext<NoteFolderTreeContextValue | undefined>(undefined)

export function NoteFolderTreeProvider({ children }: NodeFolderTreeProviderProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const contextValue = useMemo(() => ({ selectedIds, setSelectedIds }), [selectedIds])
  return (
    <NoteFolderTreeContext value={contextValue}>
      <TreeProvider
        animateExpand
        selectable
        showIcons
        showLines
        multiSelect
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      >
        {children}
      </TreeProvider>
    </NoteFolderTreeContext>
  )
}

export function useNoteFolderTree() {
  const context = use(NoteFolderTreeContext)
  if (!context) {
    throw new Error('useNoteFolderTree must be used within a NoteFolderTreeProvider')
  }
  return context
}
