import type * as stylex from '@stylexjs/stylex'
import type { HTMLAttributes, ReactNode, Ref } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { Slot } from './slot'
import { surfaceStyles } from './surface.stylex'

export type SurfaceVariant = 'default' | 'panel' | 'popover' | 'translucent'

export interface SurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> {
  asChild?: boolean
  children?: ReactNode
  ref?: Ref<HTMLDivElement>
  variant?: SurfaceVariant
  xstyle?: stylex.StyleXStyles
}

export function Surface({ asChild = false, children, ref, variant = 'default', xstyle, ...props }: SurfaceProps) {
  const rootProps = {
    ...props,
    ...stylexRuntime.props(surfaceStyles.base, surfaceStyles[variant], xstyle),
    'data-ui': 'surface',
    'data-variant': variant,
    ref,
  }
  return asChild
    ? <Slot {...rootProps}>{children}</Slot>
    : <div {...rootProps}>{children}</div>
}
