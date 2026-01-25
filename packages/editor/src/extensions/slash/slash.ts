import type { Editor } from '@tiptap/core'
import type { SlashCommand } from './slash-types'
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { filterSlashCommands, getDefaultSlashCommands } from './slash-items'
import { slashSuggestionPluginKey } from './slash-plugin-key'
import { slashSuggestionRenderer } from './slash-suggestion'
import './slash.css'

export interface SlashExtensionOptions {
  items: (editor: Editor) => SlashCommand[]
  maxItems: number
}

export const SlashExtension = Extension.create<SlashExtensionOptions>({
  name: 'slash',
  priority: 1100,

  addOptions() {
    return {
      items: () => getDefaultSlashCommands(),
      maxItems: 12,
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
        allow: ({ state }) => state.selection.empty,
        items: ({ query }) => {
          const items = this.options.items(this.editor)
          return filterSlashCommands(items, query, this.editor, this.options.maxItems)
        },
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
        render: slashSuggestionRenderer,
      }),
    ]
  },
})
