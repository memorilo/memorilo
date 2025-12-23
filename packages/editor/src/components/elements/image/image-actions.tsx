import type { MouseEvent as ReactMouseEvent } from 'react'
import { DeleteIcon } from '@memorilo/components/ui/animiated-icons/delete'
import { Button } from '@memorilo/components/ui/button'

interface ImageActionsProps {
  isResizing: boolean
  canReset: boolean
  onResetMouseDown: (e: ReactMouseEvent<HTMLButtonElement>) => void
  onDeleteMouseDown: (e: ReactMouseEvent<HTMLButtonElement>) => void
}

export function ImageActions({ isResizing, canReset, onResetMouseDown, onDeleteMouseDown }: ImageActionsProps) {
  return (
    <div
      className="absolute top-2 left-2 z-50 flex gap-1 rounded-md bg-background/80 p-1 opacity-0 shadow-sm ring-1 ring-border/50 backdrop-blur-sm transition-opacity group-hover:opacity-100"
      style={isResizing ? { opacity: 1 } : undefined}
    >
      <Button
        variant="secondary"
        size="sm"
        className="h-7 px-2 text-xs"
        contentEditable={false}
        onMouseDown={onResetMouseDown}
        disabled={!canReset}
        title="重置默认大小"
        type="button"
      >
        重置
      </Button>
      <Button
        variant="secondary"
        size="icon-sm"
        className="size-7"
        contentEditable={false}
        onMouseDown={onDeleteMouseDown}
        title="删除"
        type="button"
      >
        <DeleteIcon size={16} />
      </Button>
    </div>
  )
}
