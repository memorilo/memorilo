import type { Command } from 'prosekit/pm/state'
import { matchesKeyboardShortcut } from '@memorilo/config'
import { definePlugin, isApple, Priority, toggleMark, withPriority } from 'prosekit/core'
import { Plugin } from 'prosekit/pm/state'

export interface FormattingShortcutConfiguration {
  bold?: string
  code?: string
  italic?: string
  strike?: string
  underline?: string
}

export interface EditorShortcutConfiguration extends FormattingShortcutConfiguration {
  addBasicCard?: string
  addCloze?: string
  highlight?: string
}

const primaryModifier = isApple ? 'Mod' : 'Ctrl'

const defaultFormattingShortcuts = {
  bold: `${primaryModifier}+B`,
  code: `${primaryModifier}+E`,
  italic: `${primaryModifier}+I`,
  strike: `${primaryModifier}+S`,
  underline: `${primaryModifier}+U`,
} as const

type FormattingMark = keyof typeof defaultFormattingShortcuts

const builtInFormattingShortcuts: Record<FormattingMark, readonly string[]> = {
  bold: [defaultFormattingShortcuts.bold],
  code: [defaultFormattingShortcuts.code],
  italic: [defaultFormattingShortcuts.italic],
  strike: [defaultFormattingShortcuts.strike, `${primaryModifier}+X`],
  underline: [defaultFormattingShortcuts.underline],
}

const markCommands: Record<FormattingMark, Command> = {
  bold: toggleMark({ type: 'bold' }),
  code: toggleMark({ type: 'code' }),
  italic: toggleMark({ type: 'italic' }),
  strike: toggleMark({ type: 'strike' }),
  underline: toggleMark({ type: 'underline' }),
}

export function defineFormattingShortcuts(shortcuts: FormattingShortcutConfiguration = {}) {
  const configured = { ...defaultFormattingShortcuts, ...shortcuts }
  return withPriority(
    definePlugin(new Plugin({
      props: {
        handleKeyDown: (view, event) => {
          for (const mark of Object.keys(defaultFormattingShortcuts) as FormattingMark[]) {
            if (configured[mark].length > 0 && matchesKeyboardShortcut(event, configured[mark]))
              return markCommands[mark](view.state, view.dispatch, view)
          }
          return false
        },
      },
    })),
    Priority.highest,
  )
}

/** Prevents ProseKit defaults from firing after a formatting shortcut is cleared or remapped. */
export function defineFormattingShortcutGuards(shortcuts: FormattingShortcutConfiguration = {}) {
  const configured = { ...defaultFormattingShortcuts, ...shortcuts }
  return withPriority(definePlugin(new Plugin({
    props: {
      handleKeyDown: (view, event) => {
        for (const mark of Object.keys(defaultFormattingShortcuts) as FormattingMark[]) {
          const configuredShortcut = configured[mark]
          if (!builtInFormattingShortcuts[mark].some(shortcut => matchesKeyboardShortcut(event, shortcut))
            || matchesKeyboardShortcut(event, configuredShortcut)) {
            continue
          }
          return true
        }
        return false
      },
    },
  })), Priority.highest)
}
