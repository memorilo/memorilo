export interface ShortcutKeyboardEventLike {
  altKey: boolean
  code?: string
  ctrlKey: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}

export function shortcutFromKeyboardEvent(event: ShortcutKeyboardEventLike): string | null {
  if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key))
    return null
  if (event.key === 'Backspace' || event.key === 'Delete')
    return ''
  const key = event.code?.match(/^Key([A-Z])$/u)?.[1]
    ?? event.code?.match(/^Digit(\d)$/u)?.[1]
    ?? (event.key.length === 1
      ? event.key.toUpperCase()
      : ({ ' ': 'Space', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right', 'ArrowUp': 'Up' } as Record<string, string>)[event.key] ?? event.key)
  return [
    event.metaKey ? 'Mod' : '',
    event.ctrlKey ? 'Ctrl' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
    key,
  ].filter(Boolean).join('+')
}

export function matchesKeyboardShortcut(event: ShortcutKeyboardEventLike, shortcut: string): boolean {
  return shortcut.length > 0 && shortcutFromKeyboardEvent(event) === shortcut
}
