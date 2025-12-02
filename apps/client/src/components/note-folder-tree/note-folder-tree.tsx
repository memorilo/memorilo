import type { FolderNode } from '@memorilo/api'
import { useFolderNodeChildren, useRootFolderNodeUUID } from '@memorilo/api/query'
import { TreeExpander, TreeIcon, TreeLabel, TreeNode, TreeNodeContent, TreeNodeTrigger, TreeView } from '@memorilo/components/ui/tree'
import { Match } from 'effect'
import { LuFolder, LuHighlighter, LuNotebook, LuRefreshCcw, LuStickyNote } from 'react-icons/lu'

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
  const node = Match.value(props).pipe(
    Match.when({ typ: 'Folder' }, (node) => {
      return (
        <TreeNode level={node.level} isLast={node.isLast} nodeId={node.uuid}>
          <TreeNodeTrigger>
            <TreeExpander hasChildren />
            <TreeIcon icon={<LuFolder />} />
            <TreeLabel>{node.name}</TreeLabel>
          </TreeNodeTrigger>
          <TreeNodeContent hasChildren>
            <NoteFolderTreeNodeChildren parentUUID={node.uuid} level={node.level + 1} />
          </TreeNodeContent>
        </TreeNode>
      )
    }),
    Match.when({ typ: 'Topic' }, (node) => {
      return (
        <TreeNode level={node.level} isLast={node.isLast} nodeId={node.uuid}>
          <TreeNodeTrigger>
            <TreeIcon icon={<LuNotebook />} />
            <TreeLabel>{node.name}</TreeLabel>
          </TreeNodeTrigger>
        </TreeNode>
      )
    }),
    Match.when({ typ: 'Highlight' }, (node) => {
      return (
        <TreeNode level={node.level} isLast={node.isLast} nodeId={node.uuid}>
          <TreeNodeTrigger>
            <TreeIcon icon={<LuHighlighter />} />
            <TreeLabel>{node.name}</TreeLabel>
          </TreeNodeTrigger>
        </TreeNode>
      )
    }),
    Match.when({ typ: 'Item' }, (node) => {
      return (
        <TreeNode level={node.level} isLast={node.isLast} nodeId={node.uuid}>
          <TreeNodeTrigger>
            <TreeIcon icon={<LuStickyNote />} />
            <TreeLabel>{node.name}</TreeLabel>
          </TreeNodeTrigger>
        </TreeNode>
      )
    }),
    Match.exhaustive,
  )
  return node
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
