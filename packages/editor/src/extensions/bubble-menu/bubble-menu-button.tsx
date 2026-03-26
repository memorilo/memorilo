import type { ComponentType } from 'react'
import { IconTooltipButton } from './icon-tooltip-button'

export interface BubbleMenuButtonProps {
  label: string
  active: boolean
  Icon: ComponentType<{ size?: number }>
  onClick: () => void
  disabled?: boolean
  compact?: boolean
  testId?: string
}

export function BubbleMenuButton({
  label,
  active,
  Icon,
  onClick,
  disabled,
  compact,
  testId,
}: BubbleMenuButtonProps) {
  return (
    <IconTooltipButton
      label={label}
      Icon={Icon}
      onClick={onClick}
      disabled={disabled}
      active={active}
      className={compact ? 'h-7 w-7' : undefined}
      activeClassName="bg-accent text-accent-foreground"
      testId={testId}
    />
  )
}
