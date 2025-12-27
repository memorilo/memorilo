import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@memorilo/utils'
import { UtilButton } from '../../util-button'

type TableToolbarButtonVariant = 'icon' | 'menu'

interface TableToolbarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: TableToolbarButtonVariant
  danger?: boolean
}

export function TableToolbarButton({
  variant,
  danger = false,
  className,
  tabIndex = -1,
  ...props
}: TableToolbarButtonProps) {
  const baseClass = variant === 'icon' ? 'table-toolbar-icon' : 'table-menu-item'
  return (
    <UtilButton
      {...props}
      className={cn(baseClass, danger && 'danger', className)}
      tabIndex={tabIndex}
    />
  )
}
