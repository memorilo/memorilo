import type { CodeBlockOptions } from '@tiptap/extension-code-block'
import { InputRule } from '@tiptap/core'
import CodeBlock from '@tiptap/extension-code-block'

import { ReactNodeViewRenderer } from '@tiptap/react'
import { CodeBlockNodeView } from './components/node-view'
import { PrismPlugin } from './prism-plugin'
import './themes/prism-gruvbox-light.css'

export interface CodeBlockPrismOptions extends CodeBlockOptions {
  defaultLanguage: string | null | undefined
}

export const CodeBlockPrism = CodeBlock.extend<CodeBlockPrismOptions>({
  addInputRules() {
    return [
      new InputRule({
        find: /^```(\w+)?\s$/,
        handler: ({ range, match }) => {
          const [okay, language] = match
          if (!okay) {
            return
          }
          this.editor.chain().focus().deleteRange(range).toggleCodeBlock({ language: language ?? 'text' }).run()
        },
      }),
    ]
  },

  addAttributes() {
    return {
      language: {
        default: null,
      },
      guess: {
        default: null,
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  },

  addOptions() {
    return {
      ...this.parent?.(),
      defaultLanguage: null,
    } as CodeBlockPrismOptions
  },

  addProseMirrorPlugins() {
    return [
      ...this.parent?.() || [],
      PrismPlugin({
        name: this.name,
        defaultLanguage: this.options.defaultLanguage,
      }),
    ]
  },
}).configure({
  defaultLanguage: 'text',
  enableTabIndentation: true,
  exitOnTripleEnter: true,
})

export default CodeBlockPrism
