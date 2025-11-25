import type { FolderNode } from '@memorilo/api'
import { useFolderNodeChildren, useRootFolderNodeUUID } from '@memorilo/api/query'
import { Skeleton } from '@memorilo/components/ui/skeleton'
import { Tree, TreeItem } from '@memorilo/components/ui/tree'
import * as React from 'react'
import { FiFile, FiFolder } from 'react-icons/fi'

interface NotesTreeContextValue {
  selectedIds: string[]
  setSelectedIds: (ids: string[]) => void
  onNodeClick?: (node: FolderNode, e: React.MouseEvent) => void
  onNodeContextMenu?: (node: FolderNode, e: React.MouseEvent) => void
}

const NotesTreeContext = React.createContext<NotesTreeContextValue | null>(null)

export function useNotesTree() {
  const context = React.use(NotesTreeContext)
  if (!context) {
    throw new Error('useNotesTree must be used within a NotesTreeProvider')
  }
  return context
}

interface NotesTreeProviderProps {
  children: React.ReactNode
  selectedIds?: string[]
  onSelect?: (ids: string[]) => void
  onNodeClick?: (node: FolderNode, e: React.MouseEvent) => void
  onNodeContextMenu?: (node: FolderNode, e: React.MouseEvent) => void
}

export function NotesTreeProvider({
  children,
  selectedIds: controlledSelectedIds,
  onSelect,
  onNodeClick,
  onNodeContextMenu,
}: NotesTreeProviderProps) {
  const [internalSelectedIds, setInternalSelectedIds] = React.useState<string[]>([])

  const isControlled = controlledSelectedIds !== undefined
  const selectedIds = isControlled ? controlledSelectedIds : internalSelectedIds

  const setSelectedIds = React.useCallback(
    (ids: string[]) => {
      if (!isControlled) {
        setInternalSelectedIds(ids)
      }
      onSelect?.(ids)
    },
    [isControlled, onSelect],
  )

  const value = React.useMemo(
    () => ({
      selectedIds,
      setSelectedIds,
      onNodeClick,
      onNodeContextMenu,
    }),
    [selectedIds, setSelectedIds, onNodeClick, onNodeContextMenu],
  )

  return (
    <NotesTreeContext value={value}>
      {children}
    </NotesTreeContext>
  )
}

export function NotesFolderTree() {
  const { data: rootUuid, status, error } = useRootFolderNodeUUID()
  const { selectedIds, setSelectedIds } = useNotesTree()

  if (status === 'pending') {
    return <Skeleton />
  }
  else if (status === 'error') {
    return (
      <div className="text-red-500">
        Error loading folder tree:
        {error.message}
      </div>
    )
  }
  return (
    <Tree value={selectedIds} onValueChange={setSelectedIds}>
      <FolderNodeChildren parentUuid={rootUuid} />
    </Tree>
  )
}

function FolderTreeNode({ node }: { node: FolderNode }) {
  const { onNodeClick, onNodeContextMenu } = useNotesTree()
  const isFolder = node.typ === 'Folder' || node.typ === 'Topic'

  return (
    <TreeItem
      id={node.uuid}
      label={node.name}
      icon={isFolder ? <FiFolder className="h-4 w-4" /> : <FiFile className="h-4 w-4" />}
      hasChildren={isFolder}
      onClick={e => onNodeClick?.(node, e)}
      onContextMenu={e => onNodeContextMenu?.(node, e)}
    >
      {isFolder && <FolderNodeChildren parentUuid={node.uuid} />}
    </TreeItem>
  )
}

function FolderNodeChildren({ parentUuid }: { parentUuid: string }) {
  const { data: children, isLoading } = useFolderNodeChildren(parentUuid)

  if (isLoading)
    return <div className="py-1 text-xs text-muted-foreground">Loading...</div>

  if (!children || children.length === 0)
    return <div className="py-1 text-xs text-muted-foreground">Empty</div>

  return (
    <>
      {children.map(child => (
        <FolderTreeNode key={child.uuid} node={child} />
      ))}
    </>
  )
}
