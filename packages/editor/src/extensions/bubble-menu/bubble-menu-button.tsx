import type { ComponentType } from 'react'
import { Button } from '@memorilo/components/ui/button'
import { cn } from '@memorilo/utils'

export interface BubbleMenuButtonProps {
  label: string
  active: boolean
  Icon: ComponentType<{ size?: number }>
  onClick: () => void
}

export function BubbleMenuButton({
  label,
  active,
  Icon,
  onClick,
}: BubbleMenuButtonProps) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className={cn('h-8 w-8 px-0', active && 'bg-accent text-accent-foreground')}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <Icon size={16} />
    </Button>
  )
}
