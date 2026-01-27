import type { Editor } from '@tiptap/core'
import { useCallback, useSyncExternalStore } from 'react'
import { findListItem } from '../core/outline-utils'

export function useOrderedIndex(
  editor: Editor,
  getPos: () => number | undefined,
  isOrderedItem: boolean,
) {
  const resolveOrderedIndex = useCallback(() => {
    if (!isOrderedItem)
      return null
    const pos = getPos()
    if (typeof pos !== 'number')
      return null

    const resolvedPos = Math.min(pos + 1, editor.state.doc.content.size)
    let $pos
    try {
      $pos = editor.state.doc.resolve(resolvedPos)
    }
    catch {
      return null
    }

    const listItem = findListItem($pos)
    if (!listItem || listItem.depth < 1)
      return null

    // Ordered indices depend on sibling order, so subscribe to transactions.
    return $pos.index(listItem.depth - 1) + 1
  }, [editor, getPos, isOrderedItem])

  return useSyncExternalStore(
    (onStoreChange) => {
      if (!isOrderedItem) {
        return () => {}
      }
      editor.on('transaction', onStoreChange)
      return () => {
        editor.off('transaction', onStoreChange)
      }
    },
    resolveOrderedIndex,
    resolveOrderedIndex,
  )
}
