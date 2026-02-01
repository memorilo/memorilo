import type { Editor } from '@tiptap/core'
import type { NodeType, Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'

function needsRootChildList(root: ProseMirrorNode) {
  // Only auto-insert when the root item still contains just its title paragraph.
  if (root.childCount !== 1) {
    return false
  }
  const firstChild = root.firstChild
  return Boolean(firstChild && firstChild.type.name === 'paragraph')
}

function createEmptyListItem(listItemType: NodeType, paragraphType: NodeType) {
  return listItemType.create(null, paragraphType.create())
}

export function createOutlineRootInitPlugin(editor: Editor) {
  return new Plugin({
    key: new PluginKey('outlineRootInit'),
    appendTransaction: (_transactions, _oldState, newState) => {
      // Only create a starter child when hideTitle=true.
      if (!editor.storage.paragraph?.hideTitle) {
        return null
      }

      const root = newState.doc.firstChild
      if (!root || root.type.name !== 'listItem') {
        return null
      }
      // Avoid touching documents that already have content beyond the title.
      if (!needsRootChildList(root)) {
        return null
      }

      const bulletListType = newState.schema.nodes.bulletList
      const listItemType = newState.schema.nodes.listItem
      const paragraphType = newState.schema.nodes.paragraph
      if (!bulletListType || !listItemType || !paragraphType) {
        return null
      }

      const childItem = createEmptyListItem(listItemType, paragraphType)
      const childList = bulletListType.create(null, childItem)
      const insertPos = root.nodeSize - 1
      // Insert the first child list so the editor has a visible, editable line.
      return newState.tr.insert(insertPos, childList)
    },
  })
}
