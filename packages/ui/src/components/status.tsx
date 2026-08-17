import type * as stylex from '@stylexjs/stylex'
import type { HTMLAttributes, ReactNode } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { statusStyles } from './status.stylex'

export type StatusVariant = 'error' | 'neutral' | 'success'

export interface StatusProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> {
  children?: ReactNode
  variant?: StatusVariant
  xstyle?: stylex.StyleXStyles
}

export function Status({ children, role, variant = 'neutral', xstyle, ...props }: StatusProps) {
  return (
    <div
      {...props}
      {...stylexRuntime.props(statusStyles.root, statusStyles[variant], xstyle)}
      data-state={variant}
      data-ui="status"
      role={role ?? (variant === 'error' ? 'alert' : 'status')}
    >
      {children}
    </div>
  )
}

export const Feedback = Status
