import type { CodeBlockOptions } from '@tiptap/extension-code-block'
import { mergeAttributes } from '@tiptap/core'
import CodeBlock from '@tiptap/extension-code-block'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { toggleOutlineCodeBlock } from './commands'
import { CodeblockPrismPlugin } from './decorations'
import { resolveLanguageClass } from './language'
import { CodeBlockNodeView } from './node-view'
import './theme-tomorrow.css'

export interface CodeBlockPrismOptions extends CodeBlockOptions {}

export const CodeBlockPrism = CodeBlock.extend<CodeBlockPrismOptions>({
  addKeyboardShortcuts() {
    return {
      ...(this.parent?.() || {}),
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),
    }
  },

  addCommands() {
    const parentCommands = this.parent?.()
    return {
      ...parentCommands,
      toggleCodeBlock:
        () =>
          (props) => {
            const handled = toggleOutlineCodeBlock(props.state, props.dispatch)
            if (handled) {
              return true
            }

            const parentToggle = parentCommands?.toggleCodeBlock?.()
            return parentToggle ? parentToggle(props) : false
          },
    }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      guessLanguage: {
        default: null,
        parseHTML: element => element.getAttribute('data-guess-language'),
        renderHTML: attributes => (
          attributes.guessLanguage ? { 'data-guess-language': attributes.guessLanguage } : {}
        ),
      },
    }
  },

  renderHTML({ node, HTMLAttributes }) {
    const languageClass = resolveLanguageClass(
      node.attrs,
      this.options.languageClassPrefix,
    )
    const preAttributes = mergeAttributes(
      this.options.HTMLAttributes,
      HTMLAttributes,
      { class: languageClass },
    )

    return [
      'pre',
      preAttributes,
      ['code', 0],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  },

  addProseMirrorPlugins() {
    return [
      ...this.parent?.() || [],
      CodeblockPrismPlugin(this.name),
    ]
  },
})
