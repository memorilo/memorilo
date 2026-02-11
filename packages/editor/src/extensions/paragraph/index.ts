import type { ParagraphOptions } from '@tiptap/extension-paragraph'
import Paragraph from '@tiptap/extension-paragraph'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { getOutlineRootItem } from '../outline/core/outline-utils'

export interface TitleParagraphOptions extends ParagraphOptions {
  hideTitle?: boolean
}

export interface TitleParagraphStorage {
  hideTitle: boolean
}

declare module '@tiptap/core' {
  interface Storage {
    paragraph?: TitleParagraphStorage
  }
}

interface TitleParagraphRange {
  pos: number
  size: number
}

const ROOT_ITEM_TITLE_POS = 1

function resolveRootTitleParagraph(root: { firstChild: { type: { name: string }, nodeSize: number } | null }) {
  const firstChild = root.firstChild
  if (!firstChild || firstChild.type.name !== 'paragraph') {
    return null
  }
  return {
    // Root listItem starts at doc pos 0; its first child begins at pos 1.
    pos: ROOT_ITEM_TITLE_POS,
    size: firstChild.nodeSize,
  } satisfies TitleParagraphRange
}

function createTitleDecorationPlugin() {
  return new Plugin({
    key: new PluginKey('titleParagraph'),
    props: {
      decorations(state) {
        const root = getOutlineRootItem(state.doc)
        if (!root || root.type.name !== 'listItem') {
          return null
        }

        const titleRange = resolveRootTitleParagraph(root)
        if (!titleRange) {
          return null
        }

        const decorations = [
          Decoration.node(titleRange.pos, titleRange.pos + titleRange.size, {
            'style': 'display: none;',
            'aria-hidden': 'true',
          }),
        ]

        return DecorationSet.create(state.doc, decorations)
      },
    },
  })
}

export const TitleParagraph = Paragraph.extend<TitleParagraphOptions>({
  addOptions() {
    const parent = this.parent?.()
    return {
      ...parent,
      HTMLAttributes: parent?.HTMLAttributes ?? {},
      hideTitle: false,
    }
  },

  addStorage() {
    return {
      hideTitle: this.options.hideTitle,
    }
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? []
    if (!this.options.hideTitle) {
      return parentPlugins
    }
    return [...parentPlugins, createTitleDecorationPlugin()]
  },
})
