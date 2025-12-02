import type { ReactNode } from 'react'
import { TreeProvider, useTree } from '@memorilo/components/ui/tree'
import { createContext, use, useMemo, useState } from 'react'

interface NodeFolderTreeProviderProps {
  children: ReactNode
}

interface NoteFolderTreeContextValue {
  selectedIds: string[]
  setSelectedIds: (ids: string[]) => void
  expandedIds: Set<string>
  toggleExpanded: (id: string) => void
}

const NoteFolderTreeContext = createContext<NoteFolderTreeContextValue | undefined>(undefined)

export function NoteFolderTreeProvider({ children }: NodeFolderTreeProviderProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  return (
    <TreeProvider
      animateExpand
      selectable
      showIcons
      showLines
      multiSelect
      selectedIds={selectedIds}
      onSelectionChange={setSelectedIds}
    >
      <NoteFolderTreeInnerProvider selectedIds={selectedIds} setSelectedIds={setSelectedIds}>
        {children}
      </NoteFolderTreeInnerProvider>
    </TreeProvider>
  )
}

function NoteFolderTreeInnerProvider({ children, selectedIds, setSelectedIds}: {
  children: ReactNode
  selectedIds: string[]
  setSelectedIds: (ids: string[]) => void
}) {
  const tree = useTree()
  const contextValue = useMemo<NoteFolderTreeContextValue>(() => (
    {
      selectedIds,
      setSelectedIds,
      expandedIds: tree.expandedIds,
      toggleExpanded: tree.toggleExpanded,
    }), [selectedIds, setSelectedIds, tree])

  return (
    <NoteFolderTreeContext value={contextValue}>
      {children}
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
