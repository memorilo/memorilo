import type * as stylex from '@stylexjs/stylex'
import type { HTMLAttributes, ReactNode, Ref } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { Slot } from './slot'
import { toolbarStyles } from './toolbar.stylex'

function ToolbarRoot({ asChild = false, children, ref, variant = 'plain', xstyle, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> & {
  asChild?: boolean
  children?: ReactNode
  ref?: Ref<HTMLDivElement>
  variant?: 'floating' | 'plain'
  xstyle?: stylex.StyleXStyles
}) {
  return (
    asChild
      ? <Slot {...props} ref={ref} {...stylexRuntime.props(toolbarStyles.root, toolbarStyles[variant], xstyle)} data-ui="toolbar" data-variant={variant} role={props.role ?? 'toolbar'}>{children}</Slot>
      : <div {...props} ref={ref} {...stylexRuntime.props(toolbarStyles.root, toolbarStyles[variant], xstyle)} data-ui="toolbar" data-variant={variant} role={props.role ?? 'toolbar'}>{children}</div>
  )
}

function ToolbarGroup({ children, xstyle, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> & {
  children?: ReactNode
  xstyle?: stylex.StyleXStyles
}) {
  return <div {...props} {...stylexRuntime.props(toolbarStyles.group, xstyle)} data-ui="toolbar-group" role="group">{children}</div>
}

export const Toolbar = {
  Group: ToolbarGroup,
  Root: ToolbarRoot,
}
