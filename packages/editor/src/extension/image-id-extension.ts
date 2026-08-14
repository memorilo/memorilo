import { definePlugin, union } from 'prosekit/core'
import { Plugin } from 'prosekit/pm/state'
import { defineImageIdAttr } from '../schema/image-schema'

export type CreateImageId = () => string

function defaultCreateImageId(): string {
  return crypto.randomUUID()
}

export function defineImageIdExtension(createImageId: CreateImageId = defaultCreateImageId) {
  return union(
    defineImageIdAttr(),
    definePlugin(new Plugin({
      appendTransaction: (transactions, oldState, newState) => {
        if (!transactions.some(transaction => transaction.docChanged))
          return null

        const previousImages = new Set<object>()
        oldState.doc.descendants((node) => {
          if (node.type.name === 'image')
            previousImages.add(node)
          return true
        })
        const images: Array<{ node: object, position: number, attrs: Readonly<Record<string, unknown>> }> = []
        newState.doc.descendants((node, position) => {
          if (node.type.name === 'image')
            images.push({ attrs: node.attrs, node, position })
          return true
        })
        const reservedIds = new Set<string>()
        for (const { attrs, node } of images) {
          const imageId = attrs.imageId
          if (previousImages.has(node) && typeof imageId === 'string' && imageId.length > 0)
            reservedIds.add(imageId)
        }

        const seen = new Set<string>()
        const transaction = newState.tr
        for (const { attrs, node, position } of images) {
          const currentId = attrs.imageId
          const validCurrentId = typeof currentId === 'string' && currentId.length > 0
          const preservesExistingId = validCurrentId && previousImages.has(node) && !seen.has(currentId)
          const keepsNewUniqueId = validCurrentId && !reservedIds.has(currentId) && !seen.has(currentId)
          if (preservesExistingId || keepsNewUniqueId) {
            seen.add(currentId)
            continue
          }

          let nextId: string | null = null
          for (let attempt = 0; attempt < 100; attempt += 1) {
            const candidate = createImageId()
            if (candidate.length > 0 && !reservedIds.has(candidate) && !seen.has(candidate)) {
              nextId = candidate
              break
            }
          }
          if (!nextId)
            throw new Error('Unable to generate a unique non-empty image id')
          seen.add(nextId)
          transaction.setNodeMarkup(position, undefined, { ...attrs, imageId: nextId })
        }

        if (!transaction.docChanged)
          return null
        transaction.setMeta('addToHistory', false)
        transaction.setMeta('imageIdRepair', true)
        return transaction
      },
    })),
  )
}
