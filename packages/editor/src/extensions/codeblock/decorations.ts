import type { Node as ProsemirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { findChildren } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { isPlainLanguage, resolveLanguage } from './language'
import { isLanguageLoaded, loadLanguage, parseText } from './prism'

export function getDecorations(
  name: string,
  doc: ProsemirrorNode,
  options?: {
    requestLanguage?: (language: string) => void
  },
) {
  const decorations: Decoration[] = []

  findChildren(doc, node => node.type.name === name).forEach((block) => {
    const resolvedLanguage = resolveLanguage(block.node.attrs)
    options?.requestLanguage?.(resolvedLanguage)

    const text = block.node.textContent
    const normalizedTokens = parseText(text, resolvedLanguage, { silent: true })
    const lineStarts = getLineStarts(text)

    // Decoration positions are derived from text offsets + node position.
    for (let index = 0; index < normalizedTokens.length; index++) {
      const tokens = normalizedTokens[index]!
      const lineStart = lineStarts[index] ?? 0
      let start = block.pos + 1 + lineStart

      for (const token of tokens) {
        const length = token.empty ? 0 : token.content.length
        if (!length) {
          continue
        }

        const end = start + length

        decorations.push(Decoration.inline(start, end, {
          class: token.types.map(typ => typ).concat('token').join(' '),
        }))
        start = end
      }
    }
  })

  return DecorationSet.create(doc, decorations)
}

function getLineStarts(text: string) {
  const starts = [0]
  // Keep indices aligned for both \n and \r\n line endings.
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '\n') {
      starts.push(index + 1)
      continue
    }

    if (char === '\r') {
      if (text[index + 1] === '\n') {
        index += 1
      }
      starts.push(index + 1)
    }
  }

  return starts
}

export function CodeblockPrismPlugin(name: string) {
  const key = new PluginKey(`codeblock-prism`)
  const pendingLanguages = new Set<string>()
  let viewRef: EditorView | null = null
  const requestLanguage = (language: string) => {
    if (isPlainLanguage(language)) {
      return
    }

    if (isLanguageLoaded(language)) {
      return
    }

    if (pendingLanguages.has(language)) {
      return
    }

    pendingLanguages.add(language)
    void loadLanguage(language)
      .then(() => {
        pendingLanguages.delete(language)
        if (viewRef) {
          viewRef.dispatch(viewRef.state.tr.setMeta(key, { refresh: true }))
        }
      })
      .catch(() => {
        pendingLanguages.delete(language)
      })
  }

  const plugin: Plugin<any> = new Plugin({
    key,
    state: {
      init: (_, { doc }) => {
        return getDecorations(name, doc, { requestLanguage })
      },
      apply: (transaction, decorationSet, oldState, newState) => {
        if (transaction.getMeta(key)?.refresh) {
          return getDecorations(name, transaction.doc, { requestLanguage })
        }

        if (shouldRebuildDecorations(transaction, oldState, newState, name)) {
          return getDecorations(name, transaction.doc, { requestLanguage })
        }

        return decorationSet.map(transaction.mapping, transaction.doc)
      },
    },

    props: {
      decorations(state) {
        return plugin.getState(state)
      },
    },
    view(view) {
      viewRef = view
      return {
        destroy() {
          viewRef = null
        },
      }
    },
  },
  )
  return plugin
}

function shouldRebuildDecorations(
  transaction: Transaction,
  oldState: EditorState,
  newState: EditorState,
  nodeName: string,
) {
  if (!transaction.docChanged) {
    return false
  }

  const oldNodeName = oldState.selection.$head.parent.type.name
  const newNodeName = newState.selection.$head.parent.type.name
  const selectionTouchesNode = oldNodeName === nodeName || newNodeName === nodeName

  const oldNodes = findChildren(oldState.doc, node => node.type.name === nodeName)
  const newNodes = findChildren(newState.doc, node => node.type.name === nodeName)

  if (selectionTouchesNode || newNodes.length !== oldNodes.length) {
    return true
  }

  // Rebuild when a step fully encapsulates a code block (collab or replace-all).
  return transaction.steps.some((step) => {
    const stepMap = step.getMap()
    let encapsulatesNode = false

    stepMap.forEach((from, to) => {
      if (encapsulatesNode) {
        return
      }

      encapsulatesNode = oldNodes.some((node) => {
        return node.pos >= from && node.pos + node.node.nodeSize <= to
      })
    })

    return encapsulatesNode
  })
}
