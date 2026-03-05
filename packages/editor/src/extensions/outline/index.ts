import type { Transaction } from '@tiptap/pm/state'
import { Extension } from '@tiptap/core'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import { Fragment } from '@tiptap/pm/model'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { Option } from 'effect'
import { OutlineDocument } from './document'
import { OutlineOrdItem } from './outline-ord-item'
import { OutlineOrdList } from './outline-ord-list'
import { OutlineTaskItem } from './outline-task-item'
import { OutlineUordItem } from './outline-uord-item'
import { OutlineUList } from './outline-uord-list'
import { getParentBlock, getParentOutlineItem, getParentOutlineList } from './utils/outlines'

/**
 * Sync the first item type of a moved outline list after indent/unindent.
 *
 * The list model in this editor is: `outlineList := outlineItem outlineList*`.
 * That means when a list is moved under a different semantic parent, the first
 * child item may need to change type to stay consistent.
 *
 * Rules:
 * - If the moved list is now under an `outlineOrdList`, use `outlineOrdItem`.
 * - Otherwise fallback to `outlineUordItem` (default when no list grandparent exists).
 *
 * Example:
 * - Before unindent: an ordered layer contains a nested unordered layer.
 * - After unindent into an unordered context, the moved first item is rewritten to `outlineUordItem`.
 *
 * This helper is intentionally no-op when the replacement would be invalid.
 */
function syncMovedOutlineItemType(
  tr: Transaction,
  movedListPos: number,
  parentListTypeName?: string,
) {
  const movedList = tr.doc.nodeAt(movedListPos)
  if (!movedList || !movedList.type.isInGroup('outlineList') || movedList.childCount === 0) {
    return
  }

  const outlineOrdItemType = tr.doc.type.schema.nodes.outlineOrdItem
  const outlineUordItemType = tr.doc.type.schema.nodes.outlineUordItem
  if (!outlineOrdItemType || !outlineUordItemType) {
    return
  }

  const targetItemType = parentListTypeName === 'outlineOrdList'
    ? outlineOrdItemType
    : outlineUordItemType

  const currentItem = movedList.child(0)
  if (currentItem.type === targetItemType) {
    return
  }
  if (!movedList.canReplaceWith(0, 1, targetItemType)) {
    return
  }
  if (!targetItemType.validContent(currentItem.content)) {
    return
  }

  tr.setNodeMarkup(
    movedListPos + 1,
    targetItemType,
    currentItem.attrs,
    currentItem.marks,
  )
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    outline: {
      splitOutlineItem: () => ReturnType
      indentOutlineItem: () => ReturnType
      unindentOutlineItem: () => ReturnType
    }
  }
}

export const Outline = Extension.create({
  priority: 0,
  addOptions() {
    return {
      contentTypes: [Paragraph.type, Heading.type],
      retardableTypes: [Heading.type],
    }
  },
  addExtensions() {
    return [
      Paragraph,
      OutlineDocument,
      OutlineUList,
      OutlineUordItem,
      OutlineTaskItem,
      OutlineOrdList,
      OutlineOrdItem,
    ]
  },
  addProseMirrorPlugins() {
    return [
      // Normalize child list item types after any document change.
      // Example 1: parent `outlineOrdList` + child first item `outlineUordItem` => rewrite to `outlineOrdItem`.
      // Example 2: parent `outlineUList` + child first item `outlineOrdItem` => rewrite to `outlineUordItem`.
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged)) {
            return null
          }

          const outlineOrdListType = newState.schema.nodes.outlineOrdList
          const outlineUListType = newState.schema.nodes.outlineUList
          const outlineOrdItemType = newState.schema.nodes.outlineOrdItem
          const outlineUordItemType = newState.schema.nodes.outlineUordItem
          if (!outlineOrdListType || !outlineUListType || !outlineOrdItemType || !outlineUordItemType) {
            return null
          }

          const tr = newState.tr
          let hasFixes = false

          newState.doc.descendants((node, pos) => {
            if (node.type !== outlineOrdListType && node.type !== outlineUListType) {
              return true
            }

            node.forEach((child, offset, index) => {
              if (index === 0 || !child.type.isInGroup('outlineList') || child.childCount === 0) {
                return
              }

              const childItem = child.child(0)
              const targetItemType = node.type === outlineOrdListType
                ? outlineOrdItemType
                : childItem.type === outlineOrdItemType
                  ? outlineUordItemType
                  : null

              if (!targetItemType || childItem.type === targetItemType) {
                return
              }

              const childItemPos = pos + 1 + offset + 1
              tr.setNodeMarkup(
                tr.mapping.map(childItemPos),
                targetItemType,
                childItem.attrs,
                childItem.marks,
              )
              hasFixes = true
            })

            return true
          })

          return hasFixes ? tr : null
        },
      }),
    ]
  },
  addCommands() {
    return {
      indentOutlineItem: () => ({ state, dispatch }) => {
        const tr = state.tr
        const currentNode = this.editor.$pos(tr.selection.$from.pos)
        const ctx = Option.gen(function* () {
          const currentOutlineItem = yield* getParentOutlineItem(currentNode)
          const currentOutlineList = yield* getParentOutlineList(currentOutlineItem)
          return { currentOutlineItem, currentOutlineList }
        })
        if (Option.isNone(ctx)) {
          return false
        }
        const { currentOutlineList } = ctx.value
        const currentOutlineListParent = currentOutlineList.parent
        if (!currentOutlineListParent) {
          return false
        }

        // Get the previous sibling outline list
        const currentOutlineListIndex = tr.selection.$from.index(currentOutlineListParent.depth)
        if (currentOutlineListIndex === 0) {
          return false
        }
        const prevOutlineList = currentOutlineListParent.children?.[currentOutlineListIndex - 1]
        if (!prevOutlineList || !prevOutlineList.node.type.isInGroup('outlineList')) {
          return false
        }
        // Move the current outline list to the end of the previous sibling outline list
        tr.delete(
          tr.selection.$from.before(currentOutlineList.depth),
          tr.selection.$from.after(currentOutlineList.depth),
        )
        // get the position after the last child of the previous outline list
        const targetPos = tr.mapping.map(tr.doc.resolve(prevOutlineList.pos).end(prevOutlineList.depth), 1)
        tr.insert(
          targetPos,
          currentOutlineList.node,
        )
        syncMovedOutlineItemType(tr, targetPos, prevOutlineList.node.type.name)
        tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos)))
        if (dispatch) {
          dispatch(tr.scrollIntoView())
        }

        return true
      },

      unindentOutlineItem: () => ({ state, dispatch }) => {
        const tr = state.tr
        const currentNode = this.editor.$pos(tr.selection.$from.pos)
        const ctx = Option.gen(function* () {
          const currentOutlineItem = yield* getParentOutlineItem(currentNode)
          const currentOutlineList = yield* getParentOutlineList(currentOutlineItem)
          const parentOutlineList = yield* getParentOutlineList(currentOutlineList)
          return { currentOutlineItem, currentOutlineList, parentOutlineList }
        })
        if (Option.isNone(ctx)) {
          return false
        }
        const { parentOutlineList, currentOutlineList } = ctx.value

        const geparentOutlineListContainer = parentOutlineList.parent
        if (!geparentOutlineListContainer) {
          return false
        }
        const parentOutlineListEndPos = tr.selection.$from.after(parentOutlineList.depth)

        // move the outline list after current outline list to the children of the current outline list
        const afterFragment = tr.doc.slice(
          tr.selection.$from.after(currentOutlineList.depth),
          tr.selection.$from.end(parentOutlineList.depth),
        )
        tr.delete(
          tr.selection.$from.after(currentOutlineList.depth),
          tr.selection.$from.end(parentOutlineList.depth),
        )
        tr.insert(
          tr.selection.$from.end(currentOutlineList.depth),
          afterFragment.content,
        )

        // Move the current outline list to the geparent
        const blockToUnindent = tr.doc.slice(
          tr.selection.$from.before(currentOutlineList.depth),
          tr.selection.$from.after(currentOutlineList.depth),
        )
        tr.delete(
          tr.selection.$from.before(currentOutlineList.depth),
          tr.selection.$from.after(currentOutlineList.depth),
        )

        // Insert the unindented list right after its former parent list.
        const targetPos = tr.mapping.map(parentOutlineListEndPos, 1)
        tr.insert(
          targetPos,
          blockToUnindent.content,
        )
        const parentListTypeName = geparentOutlineListContainer.node.type.isInGroup('outlineList')
          ? geparentOutlineListContainer.node.type.name
          : undefined
        syncMovedOutlineItemType(tr, targetPos, parentListTypeName)
        // tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos)))
        if (dispatch) {
          dispatch(tr.scrollIntoView())
        }

        return true
      },

      splitOutlineItem:
        () =>
          ({ state, dispatch }) => {
            const tr = state.tr

            // If there is a selection, delete it first
            if (!state.selection.empty) {
              tr.deleteSelection()
            }

            const outlineItemType = state.schema.nodes.outlineUordItem
            const outlineListType = state.schema.nodes.outlineUList
            if (!outlineItemType || !outlineListType)
              return false

            // It maybe a node, but sometimes it's a mark, so we need to find the block node that contains the selection
            const currentNode = this.editor.$pos(tr.selection.$from.pos)

            // Find block node and outline item node that contains the current node
            const ctx = Option.gen(function* () {
              const currentBlock = yield* getParentBlock(currentNode)
              const currentOutlineItem = yield* getParentOutlineItem(currentBlock)
              const currentOutlineList = yield* getParentOutlineList(currentOutlineItem)
              return { currentBlock, currentOutlineItem, currentOutlineList }
            })

            // The current node is not inside an outline item, so we don't handle the split
            if (Option.isNone(ctx))
              return false

            const { currentBlock, currentOutlineItem, currentOutlineList } = ctx.value

            const innerBlock = currentBlock.node
            const parentOffset = tr.selection.$from.parentOffset

            const beforeContent = innerBlock.content.cut(0, parentOffset)
            const afterContent = innerBlock.content.cut(parentOffset, innerBlock.content.size)

            const beforeBlock = innerBlock.type.create(innerBlock.attrs, beforeContent, innerBlock.marks)
            const afterBlock = innerBlock.type.create(innerBlock.attrs, afterContent, innerBlock.marks)

            const beforeBlocks = []
            const afterBlocks = []

            // get the index of the current block in the outline item
            const blockIndexInOutlineItem = tr.selection.$from.index(currentOutlineItem.depth)

            for (let index = 0; index < currentOutlineItem.node.childCount; index += 1) {
              const child = currentOutlineItem.node.child(index)
              if (index < blockIndexInOutlineItem) {
                beforeBlocks.push(child)
              }
              else if (index > blockIndexInOutlineItem) {
                afterBlocks.push(child)
              }
              else {
                // The current block that be split
                beforeBlocks.push(beforeBlock)
                afterBlocks.push(afterBlock)
              }
            }

            // Update doc
            const beforeFragment = Fragment.fromArray(beforeBlocks)
            const afterFragment = Fragment.fromArray(afterBlocks)

            if (!outlineItemType.validContent(beforeFragment) || !outlineItemType.validContent(afterFragment)) {
              return false
            }

            // insert the new outline list after the origional outline list
            let outlineListEndPos = tr.selection.$from.after(currentOutlineList.depth)
            if (currentOutlineList.node.childCount > 1) {
              // if the current outline list has more than 1 child,
              // insert the new item to the children of the current outline list
              outlineListEndPos = tr.selection.$from.end(currentOutlineItem.depth)
            }
            tr.insert(
              outlineListEndPos,
              outlineListType.create(
                currentOutlineList.node.attrs,
                outlineItemType.create(currentOutlineItem.node.attrs, afterFragment),
              ),
            )

            // replace the origional outline item with the before block
            tr.replaceWith(
              tr.selection.$from.before(currentOutlineItem.depth),
              tr.selection.$from.after(currentOutlineItem.depth),
              currentOutlineItem.node.type.create(currentOutlineItem.node.attrs, beforeFragment),
            )

            // refresh cursor loc
            const $resolvedPos = tr.doc.resolve(Math.min(outlineListEndPos, tr.doc.content.size))
            tr.setSelection(TextSelection.near($resolvedPos, 1))

            if (dispatch) {
              dispatch(tr.scrollIntoView())
            }
            return true
          },
    }
  },
  addKeyboardShortcuts() {
    return {
      'Enter': ({ editor }) => editor.commands.splitOutlineItem(),
      'Tab': ({ editor }) => editor.commands.indentOutlineItem(),
      'Shift-Tab': ({ editor }) => editor.commands.unindentOutlineItem(),
    }
  },
})
