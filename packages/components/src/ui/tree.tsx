import type { VariantProps } from 'class-variance-authority'
import { cn } from '@memorilo/utils/utils'
import { cva } from 'class-variance-authority'
import { ChevronRight, Loader2 } from 'lucide-react'
import * as React from 'react'

/**
 * Style variant configuration for tree items
 */
const treeItemVariants = cva(
  'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      selected: {
        true: 'bg-accent/80 text-accent-foreground',
        false: '',
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
)

/**
 * Context props for the Tree component
 */
interface TreeContextProps {
  /** Currently selected node IDs */
  selectedIds: readonly string[]
  /** Handler for node selection */
  onSelect: (id: string, event: React.MouseEvent) => void
  /** Set the selected node IDs directly */
  setSelectedIds: (ids: readonly string[]) => void
  /** Currently expanded node IDs */
  expandedIds: readonly string[]
  /** Toggle a node's expanded/collapsed state */
  onToggleExpand: (id: string, event?: React.MouseEvent) => void
  /** Set the expanded node IDs directly */
  setExpandedIds: (ids: readonly string[]) => void
}

const TreeContext = React.createContext<TreeContextProps | null>(null)

/**
 * Get the Tree component context
 * Must be used inside a Tree or TreeProvider
 * @returns TreeContextProps
 * @throws if used outside of a Tree or TreeProvider
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { expandedIds, setExpandedIds } = useTree()
 *   // ...
 * }
 * ```
 */
export function useTree(): TreeContextProps {
  const context = React.use(TreeContext)
  if (!context) {
    throw new Error('useTree must be used within a Tree or TreeProvider')
  }
  return context
}

/**
 * Props for the TreeProvider component
 */
interface TreeProviderProps {
  /** Selected node IDs in controlled mode */
  value?: readonly string[]
  /** Callback invoked when selected IDs change */
  onValueChange?: (value: readonly string[]) => void
  children: React.ReactNode
  /** Expanded node IDs in controlled mode */
  expanded?: readonly string[]
  /** Callback invoked when expanded IDs change */
  onExpandedChange?: (value: readonly string[]) => void
}

/**
 * TreeProvider - provides selection and expansion state management for a tree
 * (does not render any UI container).
 *
 * Supports both controlled and uncontrolled modes:
 * - Controlled: state is driven via `value`/`expanded` and notified via
 *   `onValueChange`/`onExpandedChange`.
 * - Uncontrolled: component manages internal state.
 *
 * @example
 * ```tsx
 * // Provide context only, render custom UI inside
 * <TreeProvider value={selected} onValueChange={setSelected}>
 *   <CustomTreeUI />
 * </TreeProvider>
 * ```
 */
export function TreeProvider({ value, onValueChange, children, expanded, onExpandedChange }: TreeProviderProps) {
  const [internalSelectedIds, setInternalSelectedIds] = React.useState<readonly string[]>([])
  const [internalExpandedIds, setInternalExpandedIds] = React.useState<readonly string[]>([])

  const isExpandedControlled = expanded !== undefined
  const isControlled = value !== undefined

  const selectedIds = isControlled ? value : internalSelectedIds
  const expandedIds = isExpandedControlled ? expanded : internalExpandedIds

  /**
   * Handle node selection.
   * Supports multi-select with Ctrl/Cmd + click.
   */
  const handleSelect = React.useCallback(
    (id: string, event: React.MouseEvent) => {
      const isMultiSelect = event.metaKey || event.ctrlKey
      let newSelectedIds: readonly string[]

      if (isMultiSelect) {
        // Multi-select: toggle the selection state of the current node
        newSelectedIds = selectedIds.includes(id)
          ? selectedIds.filter(item => item !== id)
          : [...selectedIds, id]
      }
      else {
        // Single-select: only select the current node
        newSelectedIds = [id]
      }

      if (!isControlled) {
        setInternalSelectedIds(newSelectedIds)
      }
      onValueChange?.(newSelectedIds)
    },
    [selectedIds, isControlled, onValueChange],
  )

  const setSelectedIds = React.useCallback((ids: readonly string[]) => {
    if (!isControlled) {
      setInternalSelectedIds(ids)
    }
    onValueChange?.(ids)
  }, [isControlled, onValueChange])

  /**
   * Toggle a node's expanded/collapsed state
   */
  const handleToggleExpand = React.useCallback(
    (id: string, _event?: React.MouseEvent) => {
      const newExpandedIds = expandedIds.includes(id)
        ? expandedIds.filter(item => item !== id)
        : [...expandedIds, id]

      if (!isExpandedControlled) {
        setInternalExpandedIds(newExpandedIds)
      }
      onExpandedChange?.(newExpandedIds)
    },
    [expandedIds, isExpandedControlled, onExpandedChange],
  )

  /**
   * Directly set the list of expanded node IDs
   */
  const setExpandedIds = React.useCallback((ids: readonly string[]) => {
    if (!isExpandedControlled) {
      setInternalExpandedIds(ids)
    }
    onExpandedChange?.(ids)
  }, [isExpandedControlled, onExpandedChange])

  const contextValue = React.useMemo(() => ({
    selectedIds,
    onSelect: handleSelect,
    expandedIds,
    onToggleExpand: handleToggleExpand,
    setSelectedIds,
    setExpandedIds,
  }), [selectedIds, handleSelect, expandedIds, handleToggleExpand, setExpandedIds, setSelectedIds])

  return (
    <TreeContext value={contextValue}>
      {children}
    </TreeContext>
  )
}

/**
 * Props for the Tree component
 */
interface TreeProps extends TreeProviderProps {
  className?: string
}

/**
 * Tree - a UI wrapper that provides tree selection and expansion state
 * management to its children.
 *
 * Supports controlled and uncontrolled modes:
 * - Controlled: pass `value`/`expanded` and handlers `onValueChange`/
 *   `onExpandedChange` to manage state externally.
 * - Uncontrolled: Tree maintains its own internal state.
 *
 * @example
 * ```tsx
 * // Uncontrolled usage
 * <Tree>
 *   <TreeItem id="1" label="Item 1" />
 * </Tree>
 *
 * // Controlled usage
 * <Tree value={selected} onValueChange={setSelected} expanded={expanded} onExpandedChange={setExpanded}>
 *   <TreeItem id="1" label="Item 1" />
 * </Tree>
 * ```
 */
export function Tree({ className, children, ...providerProps }: TreeProps) {
  return (
    <TreeProvider {...providerProps}>
      <div className={cn('space-y-1', className)}>{children}</div>
    </TreeProvider>
  )
}

/**
 * Props for TreeItem component
 */
interface TreeItemProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof treeItemVariants> {
  /** Node unique identifier */
  id: string
  /** Node label to render */
  label: React.ReactNode
  /** Node icon */
  icon?: React.ReactNode
  /** Child nodes */
  children?: React.ReactNode
  /** Default expanded state in uncontrolled mode */
  defaultExpanded?: boolean
  /** Controlled expanded state (highest priority) */
  expanded?: boolean
  /** Callback when expanded state changes */
  onExpandChange?: (expanded: boolean) => void
  /** Whether the node has children (used to show expand icon for lazy load) */
  hasChildren?: boolean
  /** Whether children are loading */
  isLoading?: boolean
}

/**
 * TreeItem - a single node in the tree UI
 *
 * Expansion priority: props.expanded > context.expandedIds > defaultExpanded
 *
 * @example
 * ```tsx
 * <TreeItem id="1" label="Folder" icon={<FolderIcon />} hasChildren>
 *   <TreeItem id="1-1" label="File" />
 * </TreeItem>
 * ```
 */
export function TreeItem({
  id,
  label,
  icon,
  children,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandChange,
  hasChildren = false,
  isLoading = false,
  className,
  onClick,
  ...props
}: TreeItemProps) {
  const context = React.use(TreeContext)
  if (!context) {
    throw new Error('TreeItem must be used within a Tree')
  }

  const [isExpandedLocal, _setIsExpandedLocal] = React.useState(defaultExpanded)

  // Expansion priority: props.expanded > context.expandedIds > local state
  const isExpandedFromContext = context.expandedIds.includes(id)
  const expanded = controlledExpanded ?? (isExpandedFromContext || isExpandedLocal)

  /**
   * Handle expand/collapse click
   */
  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newExpanded = !expanded
    if (controlledExpanded === undefined) {
      // use context to manage expanded state
      context.onToggleExpand(id, e)
    }
    onExpandChange?.(newExpanded)
  }

  const isSelected = context.selectedIds.includes(id)
  const showExpandIcon = hasChildren || (children != null && children !== false)

  const handleSelect = (e: React.MouseEvent<HTMLDivElement>) => {
    context.onSelect(id, e)
    onClick?.(e)
  }

  return (
    <div className="w-full">
      <div
        className={cn(treeItemVariants({ selected: isSelected }), className)}
        {...props}
        onClick={handleSelect}
      >
        <div
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted/80',
            showExpandIcon ? 'cursor-pointer' : 'opacity-0 pointer-events-none',
          )}
          onClick={handleExpand}
        >
          {isLoading
            ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              )
            : (
                <ChevronRight
                  className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')}
                />
              )}
        </div>
        {icon && <div className="mr-2 h-4 w-4 shrink-0">{icon}</div>}
        <span className="truncate">{label}</span>
      </div>
      {expanded && (
        <div className="ml-4 border-l pl-2">
          {children}
        </div>
      )}
    </div>
  )
}
