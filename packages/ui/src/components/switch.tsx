import type * as stylex from '@stylexjs/stylex'
import type { ButtonHTMLAttributes } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { useControllableState } from '../hooks/use-controllable-state'
import { switchStyles } from './switch.stylex'

export type SwitchVariant = 'compact' | 'default'

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'onChange' | 'style' | 'value'> {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  variant?: SwitchVariant
  xstyle?: stylex.StyleXStyles
}

export function Switch({
  checked,
  defaultChecked = false,
  disabled = false,
  onCheckedChange,
  onClick,
  type = 'button',
  variant = 'default',
  xstyle,
  ...props
}: SwitchProps) {
  const [currentChecked, setChecked] = useControllableState({
    defaultValue: defaultChecked,
    onValueChange: onCheckedChange,
    value: checked,
  })
  return (
    <button
      {...props}
      {...stylexRuntime.props(switchStyles.root, variant === 'compact' && switchStyles.compactRoot, currentChecked && switchStyles.checked, xstyle)}
      aria-checked={currentChecked}
      data-state={currentChecked ? 'checked' : 'unchecked'}
      data-ui="switch"
      disabled={disabled}
      role="switch"
      type={type}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented)
          setChecked(!currentChecked)
      }}
    >
      <span {...stylexRuntime.props(switchStyles.thumb, variant === 'compact' && switchStyles.compactThumb, currentChecked && switchStyles.thumbChecked)} data-ui="switch-thumb" />
    </button>
  )
}
