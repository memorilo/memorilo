import { matchesKeyboardShortcut as matchesShortcut, shortcutFromKeyboardEvent } from '@memorilo/config'

export function keyboardShortcutFromEvent(event: KeyboardEvent): string | null {
  return shortcutFromKeyboardEvent(event)
}

export function matchesKeyboardShortcut(event: KeyboardEvent, shortcut: string): boolean {
  return matchesShortcut(event, shortcut)
}
