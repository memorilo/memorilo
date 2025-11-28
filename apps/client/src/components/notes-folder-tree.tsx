import type { FolderNode } from '@memorilo/api'
import { useFolderNodeChildren, useRootFolderNodeUUID } from '@memorilo/api/query'
import { Skeleton } from '@memorilo/components/ui/skeleton'
import { Tree, TreeItem, TreeProvider, useTree } from '@memorilo/components/ui/tree'
import * as React from 'react'
import { FiFile, FiFolder } from 'react-icons/fi'

interface NotesFolderTreeProps {
  onNodeClick?: (node: FolderNode, e: React.MouseEvent) => void
  onNodeContextMenu?: (node: FolderNode, e: React.MouseEvent) => void
}

/**
 * NotesFolderTree component - renders the notes folder tree (includes the Tree container).
 * Can be used directly; it will create the Tree context internally.
 */
export function NotesFolderTree({ onNodeClick, onNodeContextMenu }: NotesFolderTreeProps) {
  const { data: rootUuid, status, error } = useRootFolderNodeUUID()

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
    <Tree>
      <FolderNodeChildren parentUuid={rootUuid} onNodeClick={onNodeClick} onNodeContextMenu={onNodeContextMenu} />
    </Tree>
  )
}

/**
 * NotesFolderTreeContent - renders only the tree content (no Tree container).
 * Must be used inside a Tree or TreeProvider.
 */
export function NotesFolderTreeContent({ onNodeClick, onNodeContextMenu }: NotesFolderTreeProps) {
  const { data: rootUuid, status, error } = useRootFolderNodeUUID()

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
    <FolderNodeChildren parentUuid={rootUuid} onNodeClick={onNodeClick} onNodeContextMenu={onNodeContextMenu} />
  )
}

interface NotesFolderTreeRootProps extends NotesFolderTreeProps {
  /** Selected node IDs in controlled mode */
  selectedIds?: readonly string[]
  /** Callback invoked when selected IDs change */
  onSelectedIdsChange?: (ids: readonly string[]) => void
  /** Expanded node IDs in controlled mode */
  expandedIds?: readonly string[]
  /** Callback invoked when expanded IDs change */
  onExpandedIdsChange?: (ids: readonly string[]) => void
  className?: string
}

/**
 * NotesFolderTreeRoot - a full notes folder tree wrapped with Tree.
 * Supports controlled and uncontrolled modes.
 *
 * @example
 * ```tsx
 * // Uncontrolled
 * <NotesFolderTreeRoot onNodeClick={handleClick} />
 *
 * // Controlled
 * <NotesFolderTreeRoot
 *   selectedIds={selected}
 *   onSelectedIdsChange={setSelected}
 *   expandedIds={expanded}
 *   onExpandedIdsChange={setExpanded}
 * />
 * ```
 */
export function NotesFolderTreeRoot({
  selectedIds,
  onSelectedIdsChange,
  expandedIds,
  onExpandedIdsChange,
  className,
  ...props
}: NotesFolderTreeRootProps) {
  return (
    <Tree
      value={selectedIds}
      onValueChange={onSelectedIdsChange}
      expanded={expandedIds}
      onExpandedChange={onExpandedIdsChange}
      className={className}
    >
      <NotesFolderTreeContent {...props} />
    </Tree>
  )
}

interface NotesFolderTreeProviderProps {
  children: React.ReactNode
  /** 受控模式下的选中节点 ID 列表 */
  selectedIds?: readonly string[]
  /** 选中节点变化时的回调 */
  onSelectedIdsChange?: (ids: readonly string[]) => void
  /** 受控模式下的展开节点 ID 列表 */
  expandedIds?: readonly string[]
  /** 展开节点变化时的回调 */
  onExpandedIdsChange?: (ids: readonly string[]) => void
}

/**
 * NotesFolderTreeProvider - provides Tree context to children.
 * Use this when multiple components need to share tree state.
 *
 * @example
 * ```tsx
 * <NotesFolderTreeProvider>
 *   <NotesFolderTreeToolbar />
 *   <NotesFolderTreeContent />
 * </NotesFolderTreeProvider>
 * ```
 */
export function NotesFolderTreeProvider({
  children,
  selectedIds,
  onSelectedIdsChange,
  expandedIds,
  onExpandedIdsChange,
}: NotesFolderTreeProviderProps) {
  return (
    <TreeProvider
      value={selectedIds}
      onValueChange={onSelectedIdsChange}
      expanded={expandedIds}
      onExpandedChange={onExpandedIdsChange}
    >
      {children}
    </TreeProvider>
  )
}

/**
 * Use inside a Tree to access tree state and control methods.
 * This is a re-export of `useTree` for convenience.
 */
export { useTree as useNotesFolderTree }

function FolderTreeNode({ node, onNodeClick, onNodeContextMenu }: { node: FolderNode } & NotesFolderTreeProps) {
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
      {isFolder && <FolderNodeChildren parentUuid={node.uuid} onNodeClick={onNodeClick} onNodeContextMenu={onNodeContextMenu} />}
    </TreeItem>
  )
}

function FolderNodeChildren({ parentUuid, onNodeClick, onNodeContextMenu }: { parentUuid: string } & NotesFolderTreeProps) {
  const { data: children, isLoading } = useFolderNodeChildren(parentUuid)

  if (isLoading)
    return <div className="py-1 text-xs text-muted-foreground">Loading...</div>

  if (!children || children.length === 0)
    return <div className="py-1 text-xs text-muted-foreground">Empty</div>

  return (
    <>
      {children.map(child => (
        <FolderTreeNode key={child.uuid} node={child} onNodeClick={onNodeClick} onNodeContextMenu={onNodeContextMenu} />
      ))}
    </>
  )
}
