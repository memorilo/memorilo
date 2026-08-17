import type * as stylex from '@stylexjs/stylex'
import type { ButtonHTMLAttributes, ReactElement, ReactNode, Ref } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { Children } from 'react'
import { buttonStyles } from './button.stylex'
import { Slot } from './slot'

export type ButtonVariant = 'icon' | 'menu' | 'plain' | 'primary' | 'secondary' | 'titlebar' | 'toolbar'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  asChild?: boolean
  children?: ReactNode
  pressed?: boolean
  ref?: Ref<HTMLButtonElement>
  tooltip?: string
  variant?: ButtonVariant
  xstyle?: stylex.StyleXStyles
}

export function Button({
  asChild = false,
  children,
  pressed = false,
  ref,
  tooltip,
  type = 'button',
  variant = 'plain',
  xstyle,
  ...props
}: ButtonProps) {
  const rootProps = {
    ...props,
    ...stylexRuntime.props(buttonStyles.base, buttonStyles[variant], pressed && buttonStyles.pressed, xstyle),
    'aria-pressed': props['aria-pressed'] ?? (pressed ? true : undefined),
    'data-ui': 'button',
    'data-variant': variant,
    'title': props.title ?? tooltip,
  }
  if (asChild) {
    return (
      <Slot {...rootProps} ref={ref as Ref<HTMLElement>}>
        {Children.only(children) as ReactElement}
      </Slot>
    )
  }
  return (
    <button
      {...rootProps}
      ref={ref}
      type={type}
    >
      {children}
    </button>
  )
}
