import type { FolderNode } from '@memorilo/api'
import { dialog } from '@memorilo/api/command'
import { useFolderNodeChildren, useMutateDeleteFolderNode, useMutateRenameFolderNode, useRootFolderNodeUUID } from '@memorilo/api/query'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@memorilo/components/ui/context-menu'
import { TreeExpander, TreeIcon, TreeLabel, TreeNode, TreeNodeContent, TreeNodeTrigger, TreeView } from '@memorilo/components/ui/tree'
import { Match } from 'effect'
import { useRef, useState } from 'react'
import { LuFolder, LuHighlighter, LuNotebook, LuRefreshCcw, LuStickyNote } from 'react-icons/lu'
import { useNoteFolderTree } from './note-folder-tree-provider'

/**
 * Root component for the note folder tree view.
 *
 * Queries the UUID of the root folder node and renders one of:
 * - a loading skeleton while the query is pending,
 * - an error message if the query fails,
 * - the children of the root node when the query succeeds.
 *
 * The component composes lower-level tree components exported from the UI
 * primitives and delegates rendering of node children to
 * `NoteFolderTreeNodeChildren`.
 */
export function NoteFolderTree() {
  const treeNodes = Match.value(useRootFolderNodeUUID())
    .pipe(
      Match.when({ status: 'pending' }, () => <NoteFolderTreeSkeleton level={0} />),
      Match.when({ status: 'error' }, ({ error }) => (
        <span>
          Error:
          {error.name}
        </span>
      )),
      Match.when({ status: 'success' }, ({ data }) => <NoteFolderTreeNodeChildren parentUUID={data} level={0} />),
      Match.exhaustive,
    )
  return (
    <TreeView className="p-0">
      {treeNodes}
    </TreeView>
  )
}
/**
 * Base props shared by node-related components.
 *
 * `level` indicates the depth (0 = root) and is used for indentation.
 */
interface NoteFolderTreeNodeBaseProps {
  level: number
}

type NoteFolderTreeNodeProps = NoteFolderTreeNodeBaseProps & FolderNode & {
  isLast?: boolean
}
/**
 * Renders a single folder-tree node based on its discriminated `typ` field.
 *
 * See https://github.com/Memorilo/memorilo/pull/1#issue-3659098622 for details
 *
 * The component uses `Match` to exhaustively handle all variants and
 * delegates child rendering to `NoteFolderTreeNodeChildren` for folders.
 */
function NoteFolderTreeNode(props: NoteFolderTreeNodeProps) {
  const { selectedIds, setSelectedIds } = useNoteFolderTree()
  const [isRenaming, setIsRenaming] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const mutateDeleteFolderNode = useMutateDeleteFolderNode()
  const mutateRenameFolderNode = useMutateRenameFolderNode()

  async function handleDelete() {
    const isConfirm = await dialog.ask(`Are you sure you want to delete "${props.name}"?`, {
      kind: 'warning',
      okLabel: 'Delete',
    })
    if (isConfirm) {
      mutateDeleteFolderNode.mutate({
        uuid: props.uuid,
      }, {
        onSuccess: () => {
          // Deselect the deleted node if it was selected and was deleted successfully
          setSelectedIds(selectedIds.filter(id => id !== props.uuid))
        },
      })
    }
  }

  function handleStartRename() {
    setIsRenaming(true)
    setTimeout(() => {
      if (renameInputRef.current) {
        const input = renameInputRef.current
        input.value = props.name
        input.select()
        const applyRename = () => {
          setIsRenaming(false)
          mutateRenameFolderNode.mutate({
            uuid: props.uuid,
            newName: input.value,
          })
        }
        input.addEventListener('blur', applyRename)
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            applyRename()
          }
        })
      }
    }, 0)
  }

  const treeNodeIcon = Match.value(props.typ).pipe(
    Match.when('Folder', () => <LuFolder />),
    Match.when('Topic', () => <LuNotebook />),
    Match.when('Highlight', () => <LuHighlighter />),
    Match.when('Item', () => <LuStickyNote />),
    Match.exhaustive,
  )

  const treeNodeLabelWithRename
    = isRenaming ? <input ref={renameInputRef} type="text" className="ml-1 font flex-1 text-sm" /> : <TreeLabel className="pl-1">{props.name}</TreeLabel>

  const treeNode = (
    <TreeNode level={props.level} isLast={props.isLast} nodeId={props.uuid}>
      <TreeNodeTrigger>
        {props.hasChildren ? <TreeExpander hasChildren /> : null}
        {treeNodeIcon}
        {treeNodeLabelWithRename}
      </TreeNodeTrigger>
      {
        props.hasChildren
          ? (

              <TreeNodeContent hasChildren>
                <NoteFolderTreeNodeChildren parentUUID={props.uuid} level={props.level + 1} />
              </TreeNodeContent>
            )
          : null
      }
    </TreeNode>
  )
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{treeNode}</ContextMenuTrigger>
      <ContextMenuContent onCloseAutoFocus={(e) => {
        if (isRenaming) {
          e.preventDefault()
        }
      }}
      >
        <ContextMenuItem onClick={handleStartRename}>Rename</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDelete}>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface NoteFolderTreeNodeChildrenProps extends NoteFolderTreeNodeBaseProps {
  parentUUID: string
}
/**
 * Fetches and renders the child nodes of a parent folder node.
 *
 * While the children query is pending this renders `NoteFolderTreeSkeleton`.
 * On success it maps the received `FolderNode[]` into `NoteFolderTreeNode`
 * components and passes `level` and `isLast` information for correct
 * indentation and rendering.
 */
function NoteFolderTreeNodeChildren({ parentUUID, level }: NoteFolderTreeNodeChildrenProps) {
  const nodes = Match.value(useFolderNodeChildren(parentUUID))
    .pipe(
      Match.when({ status: 'pending' }, () => <NoteFolderTreeSkeleton level={level} />),
      Match.when({ status: 'error' }, ({ error }) => (
        <span>
          Error:
          {error.name}
        </span>
      )),
      Match.when({ status: 'success' }, ({ data }) => {
        return data.map((node, index, array) => (
          <NoteFolderTreeNode
            key={node.uuid}
            level={level}
            isLast={index === array.length - 1}
            {...node}
          />
        ))
      }),
      Match.exhaustive,
    )
  return nodes
}

type NoteFolderTreeSkeletonProps = NoteFolderTreeNodeBaseProps
/**
 * Small visual placeholder shown while a branch of the tree is loading.
 * It uses a spinner icon and a "Loading..." label; the `level` prop is
 * provided so the skeleton aligns with real nodes at the same depth.
 */
export function NoteFolderTreeSkeleton({ level }: NoteFolderTreeSkeletonProps) {
  return (
    <TreeNode level={level}>
      <TreeNodeTrigger>
        <TreeIcon icon={<LuRefreshCcw className="size-4 animate-[spin_2s_linear_infinite_reverse]" />} />
        <TreeLabel>Loading...</TreeLabel>
      </TreeNodeTrigger>
    </TreeNode>
  )
}
