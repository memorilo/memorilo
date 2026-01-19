import type { ComponentType } from 'react'
import { IconTooltipButton } from './icon-tooltip-button'

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
    <IconTooltipButton
      label={label}
      Icon={Icon}
      onClick={onClick}
      active={active}
      activeClassName="bg-accent text-accent-foreground"
    />
  )
}
