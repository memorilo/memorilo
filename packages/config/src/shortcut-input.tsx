import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useCallback } from 'react'
import { shortcutInputStyles } from './shortcut-input.stylex'
import { shortcutFromKeyboardEvent } from './shortcut-utils'

export interface ShortcutInputProps {
  disabled?: boolean
  label: string
  onChange: (shortcut: string) => void
  placeholder?: string
  value: string
}

const keyLabels: Record<string, string> = {
  Backspace: '⌫',
  Delete: '⌦',
  Down: '↓',
  Enter: '↵',
  Escape: 'Esc',
  Left: '←',
  PageDown: 'Page Down',
  PageUp: 'Page Up',
  Right: '→',
  Space: 'Space',
  Tab: '⇥',
  Up: '↑',
}

function shortcutKeys(shortcut: string): readonly string[] {
  return shortcut.split('+').map(key => keyLabels[key] ?? key)
}

export function ShortcutInput({
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: ShortcutInputProps) {
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const shortcut = shortcutFromKeyboardEvent(event.nativeEvent)
    if (shortcut !== null)
      onChange(shortcut)
  }, [onChange])
  return (
    <div
      aria-label={label}
      aria-readonly="true"
      aria-disabled={disabled || undefined}
      data-shortcut-input=""
      role="textbox"
      tabIndex={disabled ? -1 : 0}
      {...stylex.props(shortcutInputStyles.input)}
      onKeyDown={handleKeyDown}
    >
      {value.length > 0
        ? shortcutKeys(value).map((key, index) => (
            <span key={`${value}:${key}`}>
              {index > 0 ? <span aria-hidden="true" {...stylex.props(shortcutInputStyles.plus)}>+</span> : null}
              <kbd {...stylex.props(shortcutInputStyles.key)}>{key}</kbd>
            </span>
          ))
        : <span {...stylex.props(shortcutInputStyles.empty)}>{placeholder}</span>}
    </div>
  )
}
