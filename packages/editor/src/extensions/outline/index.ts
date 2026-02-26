import { Extension } from '@tiptap/core'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { Option } from 'effect'
import { OutlineDocument } from './document'
import { OutlineItem } from './outline-item'
import { OutlineList } from './outline-list'
import { getParentBlock, getParentOutlineItem, getParentOutlineList } from './utils/outlines'

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
      contentTypes: ['paragraph'],
    }
  },
  addExtensions() {
    return [
      OutlineDocument,
      OutlineList,
      OutlineItem,
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

        // get the position after the last child of the previous outline list
        // const targetPos = tr.selection.$from.after(parentOutlineList.depth)
        const targetPos = tr.selection.$from.posAtIndex(
          tr.selection.$from.index(parentOutlineList.depth - 1),
          parentOutlineList.depth - 1,
        )
        tr.insert(
          targetPos,
          blockToUnindent.content,
        )
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

            // get the value BEFORE replace
            let outlineListEndPos = tr.selection.$from.after(currentOutlineList.depth)

            // replace the origional outline item with the before block
            tr.replaceWith(
              tr.selection.$from.before(currentOutlineItem.depth),
              tr.selection.$from.after(currentOutlineItem.depth),
              currentOutlineItem.node.type.create(currentOutlineItem.node.attrs, beforeFragment),
            )

            // create new outline item(included in list)
            const newOutlineList = outlineListType.create(
              currentOutlineList.node.attrs,
              outlineItemType.create(currentOutlineItem.node.attrs, afterFragment),
            )

            // insert the new outline list after the origional outline list
            outlineListEndPos = tr.mapping.map(outlineListEndPos)
            tr.insert(
              outlineListEndPos,
              newOutlineList,
            )

            // refresh cursor loc
            const selectionPos = outlineListEndPos
            const $resolvedPos = tr.doc.resolve(Math.min(selectionPos, tr.doc.content.size))
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
