import type * as stylex from '@stylexjs/stylex'
import type { Ref, SelectHTMLAttributes } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { selectFieldStyles } from './select-field.stylex'

export type SelectFieldVariant = 'compact' | 'default' | 'settings'

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'style'> {
  ref?: Ref<HTMLSelectElement>
  variant?: SelectFieldVariant
  xstyle?: stylex.StyleXStyles
}

export function SelectField({ ref, variant = 'default', xstyle, ...props }: SelectFieldProps) {
  return (
    <select
      {...props}
      {...stylexRuntime.props(selectFieldStyles.select, variant === 'default' ? null : selectFieldStyles[variant], xstyle)}
      data-ui="select-field"
      ref={ref}
    />
  )
}
