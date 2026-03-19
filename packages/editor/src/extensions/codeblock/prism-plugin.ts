import type {
  Node as ProsemirrorNode,
} from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { Token } from './normalize-tokens'
import { findChildren } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Console, Effect } from 'effect'

import Prism from 'prismjs'
import { isPrismLanguageLoaded, loadPrismLanguage } from './libs/languages'
import { normalizeTokens } from './normalize-tokens'
import 'prismjs/components/prism-jsx'

function shouldSkipHighlight(language: string | null | undefined) {
  return !language || language === 'text'
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

function getDecorations({
  doc,
  name,
  defaultLanguage,
  onMissingLanguage,
}: {
  doc: ProsemirrorNode
  name: string
  defaultLanguage: string | null | undefined
  onMissingLanguage?: (language: string) => void
}) {
  const decorations: Decoration[] = []
  const requestedLanguages = new Set<string>()

  findChildren(doc, node => node.type.name === name).forEach((block) => {
    const language = block.node.attrs.language || defaultLanguage
    if (shouldSkipHighlight(language)) {
      return
    }

    if (!isPrismLanguageLoaded(language)) {
      if (!requestedLanguages.has(language)) {
        requestedLanguages.add(language)
        onMissingLanguage?.(language)
      }
      return
    }

    let normalizedTokens: Token[][]

    try {
      normalizedTokens = normalizeTokens(Prism.tokenize(block.node.textContent, Prism.languages[language]!))
    }
    catch (err: any) {
      Effect.runPromise(Console.error(`${err.message}: "${language}"`))
      return
    }

    const text = block.node.textContent
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

export function PrismPlugin({
  name,
  defaultLanguage,
}: {
  name: string
  defaultLanguage: string | null | undefined
}) {
  if (
    !defaultLanguage
  ) {
    throw new Error(
      'You must specify the defaultLanguage parameter',
    )
  }

  const key = new PluginKey('prism')
  let editorView: EditorView | null = null
  const requestLanguageLoad = (language: string) => {
    void loadPrismLanguage(language)
      .then(() => {
        if (!editorView || editorView.isDestroyed) {
          return
        }

        editorView.dispatch(editorView.state.tr.setMeta(key, { refresh: true }))
      })
      .catch((error) => {
        Effect.runPromise(Console.error(error))
      })
  }
  const prismjsPlugin: Plugin<any> = new Plugin({
    key,

    view(view) {
      editorView = view

      return {
        destroy() {
          if (editorView === view) {
            editorView = null
          }
        },
      }
    },

    state: {
      init: (_, { doc }) =>
        getDecorations({
          doc,
          name,
          defaultLanguage,
          onMissingLanguage: requestLanguageLoad,
        }),
      apply: (transaction, decorationSet, oldState, newState) => {
        if (transaction.getMeta(key)?.refresh) {
          return getDecorations({
            doc: transaction.doc,
            name,
            defaultLanguage,
            onMissingLanguage: requestLanguageLoad,
          })
        }

        if (shouldRebuildDecorations(transaction, oldState, newState, name)) {
          return getDecorations({
            doc: transaction.doc,
            name,
            defaultLanguage,
            onMissingLanguage: requestLanguageLoad,
          })
        }

        return decorationSet.map(transaction.mapping, transaction.doc)
      },
    },

    props: {
      decorations(state) {
        return prismjsPlugin.getState(state)
      },
    },
  })

  return prismjsPlugin
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

  const oldNodes = findChildren(oldState.doc, node => node.type.name === nodeName)
  const newNodes = findChildren(newState.doc, node => node.type.name === nodeName)

  // Rebuild when the set of named nodes changes, or when a named node's
  // markup/content changes. This catches attribute-only updates such as
  // language changes, which don't necessarily produce a step map that
  // encapsulates the whole node.
  if (
    newNodes.length !== oldNodes.length
    || oldNodes.some((oldNode, index) => !oldNode.node.eq(newNodes[index]!.node))
  ) {
    return true
  }

  // OR transaction has changes that completely encapsulate a node
  // (for example, a transaction that affects the entire document).
  // Such transactions can happen during collab syncing via y-prosemirror, for example.
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
