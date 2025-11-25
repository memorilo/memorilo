import type { VariantProps } from 'class-variance-authority'
import { cn } from '@memorilo/utils/utils'
import { cva } from 'class-variance-authority'
import { ChevronRight, Loader2 } from 'lucide-react'
import * as React from 'react'

const treeItemVariants = cva(
  'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      selected: {
        true: 'bg-accent text-accent-foreground',
        false: '',
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
)

interface TreeContextProps {
  selectedIds: Set<string>
  onSelect: (id: string, event: React.MouseEvent) => void
}

const TreeContext = React.createContext<TreeContextProps | null>(null)

interface TreeProps {
  value?: string[]
  onValueChange?: (value: string[]) => void
  children: React.ReactNode
  className?: string
}

export function Tree({ value, onValueChange, children, className }: TreeProps) {
  const [internalSelectedIds, setInternalSelectedIds] = React.useState<Set<string>>(() => new Set())

  const isControlled = value !== undefined
  const selectedIds = React.useMemo(() => isControlled ? new Set(value) : internalSelectedIds, [isControlled, value, internalSelectedIds])

  const handleSelect = React.useCallback(
    (id: string, event: React.MouseEvent) => {
      const newSelectedIds = new Set(event.metaKey || event.ctrlKey ? selectedIds : [])

      if (event.metaKey || event.ctrlKey) {
        if (newSelectedIds.has(id)) {
          newSelectedIds.delete(id)
        }
        else {
          newSelectedIds.add(id)
        }
      }
      else {
        newSelectedIds.add(id)
      }

      if (!isControlled) {
        setInternalSelectedIds(newSelectedIds)
      }
      onValueChange?.(Array.from(newSelectedIds))
    },
    [selectedIds, isControlled, onValueChange],
  )

  const contextValue = React.useMemo(() => ({
    selectedIds,
    onSelect: handleSelect,
  }), [selectedIds, handleSelect])

  return (
    <TreeContext
      value={contextValue}
    >
      <div className={cn('space-y-1', className)}>{children}</div>
    </TreeContext>
  )
}

interface TreeItemProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof treeItemVariants> {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
  children?: React.ReactNode
  defaultExpanded?: boolean
  expanded?: boolean
  onExpandChange?: (expanded: boolean) => void
  hasChildren?: boolean // To show chevron even if children prop is empty (for lazy load)
  isLoading?: boolean
}

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
  ...props
}: TreeItemProps) {
  const context = React.use(TreeContext)
  if (!context) {
    throw new Error('TreeItem must be used within a Tree')
  }

  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded)
  const expanded = controlledExpanded ?? isExpanded

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newExpanded = !expanded
    if (controlledExpanded === undefined) {
      setIsExpanded(newExpanded)
    }
    onExpandChange?.(newExpanded)
  }

  const isSelected = context.selectedIds.has(id)
  const showExpandIcon = hasChildren || (children != null && children !== false)

  const handleSelect = (e: React.MouseEvent<HTMLDivElement>) => {
    context.onSelect(id, e)
    props.onClick?.(e)
  }

  return (
    <div className="w-full">
      <div
        className={cn(treeItemVariants({ selected: isSelected }), className)}
        onClick={handleSelect}
        {...props}
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
