import type * as stylex from '@stylexjs/stylex'
import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { Children } from 'react'
import { buttonGroupStyles } from './button-group.stylex'
import { Slot } from './slot'

export type ButtonGroupVariant = 'glass' | 'plain' | 'toolbar'

export interface ButtonGroupProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> {
  asChild?: boolean
  children?: ReactNode
  ref?: Ref<HTMLDivElement>
  variant?: ButtonGroupVariant
  xstyle?: stylex.StyleXStyles
}

export function ButtonGroup({ asChild = false, children, ref, variant = 'plain', xstyle, ...props }: ButtonGroupProps) {
  const rootProps = {
    ...props,
    'data-ui': 'button-group',
    'data-variant': variant,
    'ref': ref,
    'role': props.role ?? 'group',
    ...stylexRuntime.props(buttonGroupStyles.base, buttonGroupStyles[variant], xstyle),
  }
  return asChild
    ? <Slot {...rootProps}>{Children.only(children) as ReactElement}</Slot>
    : <div {...rootProps}>{children}</div>
}
