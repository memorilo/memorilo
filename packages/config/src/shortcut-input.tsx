import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { TextField } from '@memorilo/ui'
import { useCallback } from 'react'
import { shortcutFromKeyboardEvent } from './shortcut-utils'

export interface ShortcutInputProps {
  disabled?: boolean
  label: string
  onChange: (shortcut: string) => void
  placeholder?: string
  value: string
}

export function ShortcutInput({
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: ShortcutInputProps) {
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const shortcut = shortcutFromKeyboardEvent(event.nativeEvent)
    if (shortcut !== null)
      onChange(shortcut)
  }, [onChange])
  return (
    <TextField
      aria-label={label}
      data-shortcut-input=""
      disabled={disabled}
      placeholder={placeholder}
      readOnly
      type="text"
      value={value}
      variant="settings"
      onKeyDown={handleKeyDown}
    />
  )
}
