import type { ReactNode } from 'react'
import { Button } from '@memorilo/ui'

export function PageTitlebarButton({
  children,
  disabled = false,
  label,
  onClick,
  title = label,
}: {
  children: ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
  title?: string
}) {
  return (
    <Button
      aria-label={label}
      data-window-no-drag=""
      disabled={disabled}
      title={title}
      variant="titlebar"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
