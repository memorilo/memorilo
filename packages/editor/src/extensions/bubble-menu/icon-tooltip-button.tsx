import type { ComponentType } from 'react'
import { Button } from '@memorilo/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@memorilo/components/ui/tooltip'
import { cn } from '@memorilo/utils'

export interface IconTooltipButtonProps {
  label: string
  Icon: ComponentType<{ size?: number }>
  onClick: () => void
  disabled?: boolean
  active?: boolean
  className?: string
  activeClassName?: string
}

export function IconTooltipButton({
  label,
  Icon,
  onClick,
  disabled,
  active,
  className,
  activeClassName,
}: IconTooltipButtonProps) {
  const ariaPressed = typeof active === 'boolean' ? active : undefined

  return (
    <Tooltip>
      <TooltipTrigger
        render={tooltipProps => (
          <Button
            {...tooltipProps}
            aria-label={label}
            aria-pressed={ariaPressed}
            className={cn('h-8 w-8 px-0', className, active && activeClassName, tooltipProps.className)}
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={(event) => {
              tooltipProps.onClick?.(event)
              if (!disabled) {
                onClick()
              }
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
            disabled={disabled}
          >
            <Icon size={16} />
          </Button>
        )}
      />
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
