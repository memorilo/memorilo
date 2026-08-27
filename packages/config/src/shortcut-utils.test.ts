import { describe, expect, it } from 'vitest'
import { matchesKeyboardShortcut, shortcutFromKeyboardEvent } from './shortcut-utils'

describe('shortcut utilities', () => {
  it('normalizes letter, navigation, and modifier combinations', () => {
    expect(shortcutFromKeyboardEvent({ key: 'a', code: 'KeyA', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })).toBe('Alt+A')
    expect(shortcutFromKeyboardEvent({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })).toBe('Alt+Left')
    expect(shortcutFromKeyboardEvent({ key: 'A', code: 'KeyA', altKey: true, ctrlKey: false, metaKey: false, shiftKey: true })).toBe('Alt+Shift+A')
    expect(shortcutFromKeyboardEvent({ key: 'å', code: 'KeyA', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })).toBe('Alt+A')
  })

  it('clears on Backspace/Delete and ignores modifier-only presses', () => {
    const modifiers = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
    expect(shortcutFromKeyboardEvent({ ...modifiers, key: 'Backspace' })).toBe('')
    expect(shortcutFromKeyboardEvent({ ...modifiers, key: 'Delete' })).toBe('')
    expect(shortcutFromKeyboardEvent({ ...modifiers, key: 'Alt' })).toBeNull()
  })

  it('matches exact configured shortcuts and never matches an empty binding', () => {
    const event = { key: 'x', code: 'KeyX', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }
    expect(matchesKeyboardShortcut(event, 'Alt+X')).toBe(true)
    expect(matchesKeyboardShortcut(event, 'Alt+Shift+X')).toBe(false)
    expect(matchesKeyboardShortcut(event, '')).toBe(false)
  })
})
