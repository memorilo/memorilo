import type { OutlineItemOptions } from './types'
import { mergeAttributes, Node } from '@tiptap/core'
import { BulletList } from '@tiptap/extension-bullet-list'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { outlineCommands, outlineKeymap } from './outline-actions'
import { OutlineItemView } from './outline-item-view'
import {
  findFirstChildListPos,
  findListItem,
  findSiblingListItemPos,
  isEmptyOutlineParagraph,
  isOutlineTextBlockNode,
} from './outline-utils'

export const OutlineBulletList = BulletList.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Backspace: () => {
        const { state, view } = this.editor
        const { selection } = state
        if (!selection.empty)
          return false

        const { $from } = selection
        if (!isOutlineTextBlockNode($from.parent) || $from.parentOffset !== 0) {
          return false
        }

        const listItem = findListItem($from)
        if (!listItem)
          return false

        const isEmpty = isEmptyOutlineParagraph($from.parent)
        if (!isEmpty) {
          return true
        }

        if (listItem.node.childCount > 1) {
          // Preserve the list item when deleting a trailing empty paragraph.
          const paragraphPos = $from.before($from.depth)
          const tr = state.tr.delete(paragraphPos, paragraphPos + $from.parent.nodeSize)
          view.dispatch(tr)
          return true
        }

        const listDepth = listItem.depth - 1
        if (listDepth < 0)
          return true

        const listNode = $from.node(listDepth)
        if (listNode.childCount <= 1) {
          return true
        }

        const prevPos = findSiblingListItemPos(state, listItem, 'prev')
        const nextPos = findSiblingListItemPos(state, listItem, 'next')
        const tr = state.tr.delete(listItem.pos, listItem.pos + listItem.node.nodeSize)
        const targetPos = prevPos ?? nextPos
        if (targetPos !== null) {
          const mapped = tr.mapping.map(targetPos)
          tr.setSelection(TextSelection.near(tr.doc.resolve(mapped + 1)))
        }

        view.dispatch(tr)
        return true
      },
    }
  },
})

export const OutlineItem = Node.create<OutlineItemOptions>({
  name: 'listItem',

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  content: '(paragraph | heading | codeBlock | image | blockMath) block*',

  defining: true,

  addAttributes() {
    return {
      folded: {
        default: false,
        keepOnSplit: false,
        parseHTML: () => false,
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'li' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['li', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(OutlineItemView)
  },

  addCommands() {
    return outlineCommands
  },

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: new PluginKey('outlineItemEnterHandler'),
        props: {
          handleKeyDown: (view, event) => {
            if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.shiftKey) {
              return false
            }

            const { state, dispatch } = view
            const { $from } = state.selection
            const parent = $from.parent

            if (!isOutlineTextBlockNode(parent)) {
              return false
            }

            const listItem = findListItem($from)
            if (!listItem) {
              return false
            }

            const isEmpty = parent.content.size === 0
            const childListPos = findFirstChildListPos(listItem)

            // Top-level nodes have a fixed depth of 2: doc -> bulletList -> listItem
            const isTopLevel = listItem.depth === 2

            if (childListPos !== null && !isEmpty) {
              // Has children and the current paragraph is not empty: insert the new node as the first child
              const listItemType = state.schema.nodes.listItem
              const paragraphType = state.schema.nodes.paragraph
              if (!listItemType || !paragraphType)
                return false

              // Insert a new listItem at the start of the child list
              const tr = state.tr.insert(
                childListPos + 1,
                listItemType.create(null, paragraphType.create()),
              )
              tr.setSelection(TextSelection.near(tr.doc.resolve(childListPos + 2)))
              dispatch(tr)
              return true
            }

            if (isTopLevel) {
              // Top-level empty node without a child list: always create a sibling node
              if (isEmpty && childListPos === null) {
                const listItemType = state.schema.nodes.listItem
                const paragraphType = state.schema.nodes.paragraph
                if (!listItemType || !paragraphType)
                  return false

                const insertPos = listItem.pos + listItem.node.nodeSize
                const tr = state.tr.insert(
                  insertPos,
                  listItemType.create(null, paragraphType.create()),
                )
                tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)))
                dispatch(tr)
                return true
              }

              // Top-level node: create a sibling node
              return editor.commands.splitListItem('listItem')
            }

            // Non-top-level node
            if (isEmpty) {
              // Empty content: reduce indentation
              return editor.commands.liftListItem('listItem')
            }

            // Non-empty content: create a sibling node
            return editor.commands.splitListItem('listItem')
          },
        },
      }),
    ]
  },

  addKeyboardShortcuts() {
    return outlineKeymap(this.name)
  },
})
