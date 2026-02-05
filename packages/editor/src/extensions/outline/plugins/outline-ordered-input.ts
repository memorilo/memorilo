import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { findListItem, isImeComposing, isOutlineTextBlockNode, isSelectionInTable } from '../core/outline-utils'

const orderedItemInputRegex = /^(\d+)\.$/

function canConvertToOrderedList(listNode: ProseMirrorNode) {
  let allowed = true
  listNode.forEach((child) => {
    if (child.type.name === 'taskItem') {
      // Avoid converting task lists with "1." input.
      allowed = false
    }
  })
  return allowed
}

export function createOrderedItemInputPlugin() {
  return new Plugin({
    key: new PluginKey('outlineOrderedItemInput'),
    props: {
      handleKeyDown(view, event) {
        // IME composition uses Space for candidate selection; skip to avoid syncing preedit text.
        if (isImeComposing(view, event)) {
          return false
        }

        if (event.key !== ' ' && event.key !== 'Spacebar' && event.code !== 'Space')
          return false

        const { state } = view
        if (!state.selection.empty)
          return false

        const { $from } = state.selection
        if (isSelectionInTable($from))
          return false
        const parent = $from.parent
        if (!isOutlineTextBlockNode(parent))
          return false

        const beforeText = parent.textBetween(0, $from.parentOffset, undefined, '\uFFFC')
        const afterText = parent.textBetween($from.parentOffset, parent.content.size, undefined, '\uFFFC')
        if (afterText.length > 0)
          return false

        const match = beforeText.match(orderedItemInputRegex)
        if (!match)
          return false

        const orderedListType = state.schema.nodes.orderedList
        const orderedItemType = state.schema.nodes.orderedItem
        if (!orderedListType || !orderedItemType)
          return false

        const listItem = findListItem($from)
        if (!listItem)
          return false

        const listDepth = listItem.depth - 1
        if (listDepth <= 1)
          return false

        const listNode = $from.node(listDepth)
        if (listNode.type.name === 'orderedList')
          return false
        if (!canConvertToOrderedList(listNode))
          return false

        // Replace the list node in a single step so the schema stays valid during conversion.
        const listPos = $from.before(listDepth)
        const listEnd = listPos + listNode.nodeSize
        const parentStart = $from.start()
        const parentOffset = $from.parentOffset
        const matchLength = match[0]?.length ?? 0
        const parentOffsetFromList = parentStart - listPos
        const orderedItems = [] as ProseMirrorNode[]
        listNode.forEach((child) => {
          if (child.type === orderedItemType) {
            orderedItems.push(child)
            return
          }
          orderedItems.push(orderedItemType.create(child.attrs, child.content, child.marks))
        })

        const nextList = orderedListType.create(listNode.attrs, orderedItems)
        const tr = state.tr.replaceWith(listPos, listEnd, nextList)

        // Delete the typed "1." prefix (and trailing space) after the list is converted.
        const mappedListPos = tr.mapping.map(listPos)
        const newParentStart = mappedListPos + parentOffsetFromList
        const deleteFrom = newParentStart + parentOffset - matchLength
        let deleteTo = newParentStart + parentOffset
        const nextChar = tr.doc.textBetween(deleteTo, deleteTo + 1, undefined, '\uFFFC')
        if (nextChar === ' ')
          deleteTo += 1
        tr.delete(deleteFrom, deleteTo)
        tr.setSelection(TextSelection.near(tr.doc.resolve(deleteFrom)))
        event.preventDefault()
        view.dispatch(tr.scrollIntoView())
        return true
      },
    },
  })
}
