import type { MouseEvent as ReactMouseEvent } from 'react'
import { DeleteIcon } from '@memorilo/components/ui/animated-icons/delete'
import { Button } from '@memorilo/components/ui/button'
import { useTranslation } from 'react-i18next'

interface ImageActionsProps {
  isResizing: boolean
  canReset: boolean
  onResetMouseDown: (e: ReactMouseEvent<HTMLButtonElement>) => void
  onDeleteMouseDown: (e: ReactMouseEvent<HTMLButtonElement>) => void
}

export function ImageActions({ isResizing, canReset, onResetMouseDown, onDeleteMouseDown }: ImageActionsProps) {
  const { t } = useTranslation('app')
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
        title={t('editor.image.actions.resetTooltip')}
        type="button"
      >
        {t('editor.image.actions.reset')}
      </Button>
      <Button
        variant="secondary"
        size="icon-sm"
        className="size-7"
        contentEditable={false}
        onMouseDown={onDeleteMouseDown}
        title={t('editor.image.actions.deleteTooltip')}
        type="button"
      >
        <DeleteIcon size={16} />
      </Button>
    </div>
  )
}
