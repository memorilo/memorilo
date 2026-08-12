import type { Extension } from 'prosekit/core'
import type { Node as ProseMirrorNode } from 'prosekit/pm/model'
import { definePlugin } from 'prosekit/core'
import { Plugin } from 'prosekit/pm/state'
import { validateRequiredId } from '../schema/card-schema'
import { ownCardDefinitionIds } from './card-tree'

/** Clears answer membership when its source delimiter was removed or moved. */
export function defineCardMembershipReconciler(): Extension {
  return definePlugin(new Plugin({
    appendTransaction: (transactions, _oldState, newState) => {
      if (!transactions.some(transaction => transaction.docChanged))
        return null
      const transaction = newState.tr
      const walk = (node: ProseMirrorNode, position: number): void => {
        const ownDefinitions = node.type.name === 'list' ? ownCardDefinitionIds(node) : new Set<string>()
        node.forEach((child, offset) => {
          const childPosition = position + 1 + offset
          if (child.type.name === 'list') {
            const memberDefinitionId = child.attrs.cardItemDefinitionId
            if (memberDefinitionId !== null && memberDefinitionId !== undefined) {
              validateRequiredId(memberDefinitionId)
              if (!ownDefinitions.has(memberDefinitionId)) {
                transaction.setNodeMarkup(childPosition, undefined, {
                  ...child.attrs,
                  cardItemDefinitionId: null,
                })
              }
            }
            walk(child, childPosition)
            return
          }
          walk(child, childPosition)
        })
      }
      newState.doc.forEach((child, offset) => {
        if (child.type.name === 'list') {
          const membership = child.attrs.cardItemDefinitionId
          if (membership !== null && membership !== undefined) {
            transaction.setNodeMarkup(offset, undefined, { ...child.attrs, cardItemDefinitionId: null })
          }
          walk(child, offset)
        }
        else {
          walk(child, offset)
        }
      })
      return transaction.docChanged ? transaction : null
    },
  }))
}
