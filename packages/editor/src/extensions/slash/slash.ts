import type { Editor, Range } from '@tiptap/core'
import type { ResolvedPos } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { SlashCommand } from './slash-types'
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { filterSlashCommands, getDefaultSlashCommands } from './slash-items'
import { slashSuggestionPluginKey } from './slash-plugin-key'
import { slashSuggestionRenderer } from './slash-suggestion'
import './slash.css'

export interface SlashOptions {
  items: (editor: Editor) => SlashCommand[]
}

function findSlashMatch($position: ResolvedPos) {
  const parent = $position.parent
  if (!parent.isTextblock) {
    return null
  }

  const textBefore = parent.textBetween(0, $position.parentOffset, '\uFFFC', '\uFFFC')
  const match = textBefore.match(/\/[^\s/]*$/)
  if (!match || match.index === undefined) {
    return null
  }

  const text = match[0]
  const from = $position.start() + match.index
  const to = from + text.length

  if (to !== $position.pos) {
    return null
  }

  return {
    range: { from, to },
    query: text.slice(1),
    text,
  }
}

function resolvePreviousPosition(transaction: Transaction, range: Range) {
  const inverted = transaction.mapping.invert()
  const prevPos = inverted.map(range.to, -1)
  const prevDoc = transaction.before
  const clampedPos = Math.min(Math.max(prevPos, 0), prevDoc.content.size)
  return prevDoc.resolve(clampedPos)
}

function wasSlashInserted(transaction: Transaction, range: Range) {
  // If the previous document already matched `/...`, this edit is just appending.
  const prevResolved = resolvePreviousPosition(transaction, range)
  const previousMatch = findSlashMatch(prevResolved)

  return !previousMatch
}

function shouldShowSlashSession(
  editor: Editor,
  transaction: Transaction,
  range: Range,
) {
  const { slash } = editor.storage
  // Start on document edits, cancel on selection moves, and keep alive for meta-only transactions.
  if (transaction.docChanged) {
    if (slash.sessionActive) {
      return true
    }
    const isNewSlash = wasSlashInserted(transaction, range)
    if (isNewSlash) {
      slash.sessionActive = true
    }
    return isNewSlash
  }

  if (transaction.selectionSet) {
    slash.sessionActive = false
    return false
  }

  return slash.sessionActive
}

export const Slash = Extension.create<SlashOptions>({
  name: 'slash',
  priority: 1100,

  addOptions() {
    return {
      items: () => getDefaultSlashCommands(),
    }
  },

  addStorage() {
    return {
      sessionActive: false,
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: slashSuggestionPluginKey,
        char: '/',
        startOfLine: false,
        decorationTag: 'span',
        decorationClass: 'slash-suggestion',
        decorationEmptyClass: 'slash-suggestion-empty',
        findSuggestionMatch: ({ $position }) => findSlashMatch($position),
        allow: ({ editor, state }) => editor.isEditable && state.selection.empty,
        shouldShow: ({ editor, transaction, range }) => shouldShowSlashSession(editor, transaction, range),
        items: ({ query }) => {
          const items = this.options.items(this.editor)
          return filterSlashCommands(items, query, this.editor)
        },
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
        render: slashSuggestionRenderer,
      }),
    ]
  },
})
