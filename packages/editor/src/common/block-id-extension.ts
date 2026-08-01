import { definePlugin, union } from 'prosekit/core'
import { Plugin } from 'prosekit/pm/state'
import { defineBlockIdAttr } from '../schema/block-id-schema'

export type CreateBlockId = () => string

function defaultCreateBlockId(): string {
  return crypto.randomUUID()
}

export function defineBlockIdExtension(
  createBlockId: CreateBlockId = defaultCreateBlockId,
) {
  return union(
    defineBlockIdAttr(),
    definePlugin(new Plugin({
      appendTransaction: (transactions, _oldState, newState) => {
        if (!transactions.some(transaction => transaction.docChanged))
          return null

        const seen = new Set<string>()
        const transaction = newState.tr

        newState.doc.descendants((node, position) => {
          if (node.type.name !== 'list')
            return true

          const currentId = node.attrs.blockId
          if (typeof currentId === 'string' && currentId.length > 0 && !seen.has(currentId)) {
            seen.add(currentId)
            return true
          }

          let nextId: string | null = null
          for (let attempt = 0; attempt < 100; attempt += 1) {
            const candidate = createBlockId()
            if (candidate.length > 0 && !seen.has(candidate)) {
              nextId = candidate
              break
            }
          }
          if (!nextId)
            throw new Error('Unable to generate a unique non-empty outline block id')
          seen.add(nextId)
          transaction.setNodeMarkup(position, undefined, { ...node.attrs, blockId: nextId })
          return true
        })

        if (!transaction.docChanged)
          return null

        transaction.setMeta('addToHistory', false)
        transaction.setMeta('outlineBlockIdRepair', true)
        return transaction
      },
    })),
  )
}
