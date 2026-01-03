import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@memorilo/components/ui/tooltip'
import { UtilButton } from '../util-button'

export interface ToolbarIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

export function ToolbarIconButton({
  label,
  children,
  disabled,
  ...props
}: ToolbarIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <UtilButton
            {...props}
            disabled={disabled}
            aria-label={label}
            title={label}
          >
            {children}
          </UtilButton>
        </span>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
