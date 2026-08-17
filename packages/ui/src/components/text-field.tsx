import type * as stylex from '@stylexjs/stylex'
import type { InputHTMLAttributes, Ref } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { textFieldStyles } from './text-field.stylex'

export type TextFieldVariant = 'compact' | 'default' | 'settings'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'style'> {
  ref?: Ref<HTMLInputElement>
  variant?: TextFieldVariant
  xstyle?: stylex.StyleXStyles
}

export function TextField({ type = 'text', variant = 'default', xstyle, ...props }: TextFieldProps) {
  return (
    <input
      {...props}
      {...stylexRuntime.props(textFieldStyles.input, variant === 'default' ? null : textFieldStyles[variant], xstyle)}
      data-ui="text-field"
      type={type}
    />
  )
}
