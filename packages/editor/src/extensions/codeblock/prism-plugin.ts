import type {
  Node as ProsemirrorNode,
} from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Token } from './normalize-tokens'
import { findChildren } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import Prism from 'prismjs'
import { normalizeTokens } from './normalize-tokens'
import 'prismjs/components/prism-text'

function isLangRegistered(aliasOrLanguage: string) {
  const allSupportLang = Object.keys(Prism.languages).filter(
    id => typeof Prism.languages[id] === 'object',
  )
  return Boolean(allSupportLang.find(x => x === aliasOrLanguage))
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
}: {
  doc: ProsemirrorNode
  name: string
  defaultLanguage: string | null | undefined
}) {
  const decorations: Decoration[] = []

  findChildren(doc, node => node.type.name === name).forEach((block) => {
    const language = block.node.attrs.language || defaultLanguage

    let normalizedTokens: Token[][]

    try {
      if (!isLangRegistered(language)) {
        import(`prismjs/components/prism-${language}`)
      }
      normalizedTokens = normalizeTokens(Prism.tokenize(block.node.textContent, Prism.languages[language]!))
    }
    catch (err: any) {
      console.error(`${err.message}: "${language}"`)
      normalizedTokens = normalizeTokens(Prism.tokenize(block.node.textContent, Prism.languages.javascript!))
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
  const prismjsPlugin: Plugin<any> = new Plugin({
    key,

    state: {
      init: (_, { doc }) =>
        getDecorations({
          doc,
          name,
          defaultLanguage,
        }),
      apply: (transaction, decorationSet, oldState, newState) => {
        if (transaction.getMeta(key)?.refresh) {
          return getDecorations({
            doc: transaction.doc,
            name,
            defaultLanguage,
          })
        }

        if (shouldRebuildDecorations(transaction, oldState, newState, name)) {
          return getDecorations({
            doc: transaction.doc,
            name,
            defaultLanguage,
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

  const oldNodeName = oldState.selection.$head.parent.type.name
  const newNodeName = newState.selection.$head.parent.type.name
  const selectionTouchesNode = oldNodeName === nodeName || newNodeName === nodeName

  const oldNodes = findChildren(oldState.doc, node => node.type.name === nodeName)
  const newNodes = findChildren(newState.doc, node => node.type.name === nodeName)

  // Apply decorations if:
  // selection includes named node,
  // OR transaction adds/removes named node,
  if (selectionTouchesNode || newNodes.length !== oldNodes.length) {
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
