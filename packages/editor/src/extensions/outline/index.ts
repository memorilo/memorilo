import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { Extension } from '@tiptap/core'
import Paragraph from '@tiptap/extension-paragraph'
import { Fragment } from '@tiptap/pm/model'
import { Plugin, Selection, TextSelection } from '@tiptap/pm/state'
import { Option } from 'effect'
import { findClosestAncestor } from '../../utils/node-traversal'
import { OutlineDocument } from './document'
import { OutlineOrdItem } from './outline-ord-item'
import { OutlineOrdList } from './outline-ord-list'
import { OutlineTaskItem } from './outline-task-item'
import { OutlineUordItem } from './outline-uord-item'
import { OutlineUList } from './outline-uord-list'
import { getParentOutlineItem, getParentOutlineList } from './utils/outlines'

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

const SPLITTABLE_DIRECT_BLOCK_TYPES = new Set(['paragraph', 'heading'])

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
          ({ state, dispatch, tr }) => {
            const { $from, $to } = state.selection
            const directBlock = $from.parent
            if ($to.parent !== directBlock) {
              return false
            }

            const outlineItem = findClosestAncestor($from, node => node.type.isInGroup('outlineItem'))
            const outlineList = findClosestAncestor($from, node => node.type.isInGroup('outlineList'))
            if (!outlineItem || !outlineList) {
              return false
            }

            const directBlockIndex = $from.index(outlineItem.depth)
            if (directBlockIndex < 0 || directBlockIndex >= outlineItem.node.childCount) {
              return false
            }
            if (!outlineItem.node.child(directBlockIndex).eq(directBlock)) {
              return false
            }

            // Split only supports a selection that stays inside one direct block
            // of the current outline item. Once the range crosses blocks or enters
            // nested structure, this command can no longer rebuild the item safely.
            // Keep custom split behavior to plain editable textblocks we know how
            // to reconstruct. Code blocks or unsupported block types should fall
            // back to their own Enter semantics instead of being rewritten here.
            if (!directBlock.isTextblock || directBlock.type.spec.code) {
              return false
            }
            if (!SPLITTABLE_DIRECT_BLOCK_TYPES.has(directBlock.type.name)) {
              return false
            }

            const directBlockPos = $from.before($from.depth)
            const outlineItemPos = outlineItem.pos
            const outlineListPos = outlineList.pos

            // If there is a selection, delete it first
            if (!tr.selection.empty) {
              tr.deleteSelection()
            }

            const outlineItemType = state.schema.nodes.outlineUordItem
            const outlineListType = state.schema.nodes.outlineUList
            const paragraphType = state.schema.nodes.paragraph
            if (!outlineItemType || !outlineListType || !paragraphType) {
              throw new Error('Required node types are not defined in the schema')
            }

            const mappedDirectBlockPos = tr.mapping.map(directBlockPos, -1)
            const mappedOutlineItemPos = tr.mapping.map(outlineItemPos, -1)
            const mappedOutlineListPos = tr.mapping.map(outlineListPos, -1)
            const currentDirectBlock = tr.doc.nodeAt(mappedDirectBlockPos)
            const currentOutlineItem = tr.doc.nodeAt(mappedOutlineItemPos)
            const currentOutlineList = tr.doc.nodeAt(mappedOutlineListPos)
            if (!currentDirectBlock || !currentOutlineItem || !currentOutlineList) {
              return false
            }
            if (!currentOutlineItem.type.isInGroup('outlineItem') || !currentOutlineList.type.isInGroup('outlineList')) {
              return false
            }
            if (directBlockIndex >= currentOutlineItem.childCount || !currentOutlineItem.child(directBlockIndex).eq(currentDirectBlock)) {
              return false
            }

            const { $from: mappedFrom } = tr.selection

            const beforeBlocks: PMNode[] = []
            const afterBlocks: PMNode[] = []
            const isTrailingEmptyParagraph = currentDirectBlock.type === paragraphType
              && directBlockIndex === currentOutlineItem.childCount - 1
              && directBlockIndex > 0
              && mappedFrom.parent.type === paragraphType
              && mappedFrom.parent.content.size === 0
              && mappedFrom.parentOffset === 0

            // Special case: pressing Enter on a trailing empty paragraph should move
            // that empty paragraph into the new split item, instead of keeping an
            // extra empty tail block in the current item and then splitting again.
            const cleanupTrailingParagraphRange: { from: number, to: number } | null = isTrailingEmptyParagraph
              ? {
                  from: mappedDirectBlockPos,
                  to: mappedDirectBlockPos + currentDirectBlock.nodeSize,
                }
              : null

            if (cleanupTrailingParagraphRange) {
              afterBlocks.push(paragraphType.create(currentDirectBlock.attrs, currentDirectBlock.content, currentDirectBlock.marks))
            }
            else {
              const splitOffset = mappedFrom.parentOffset
              if (splitOffset < 0 || splitOffset > currentDirectBlock.content.size) {
                return false
              }

              const beforeContent = currentDirectBlock.content.cut(0, splitOffset)
              const afterContent = currentDirectBlock.content.cut(splitOffset, currentDirectBlock.content.size)
              if (!currentDirectBlock.type.validContent(beforeContent) || !currentDirectBlock.type.validContent(afterContent)) {
                return false
              }

              const beforeBlock = currentDirectBlock.type.create(currentDirectBlock.attrs, beforeContent, currentDirectBlock.marks)
              const afterBlock = currentDirectBlock.type.create(currentDirectBlock.attrs, afterContent, currentDirectBlock.marks)

              for (let index = 0; index < currentOutlineItem.childCount; index += 1) {
                const child = currentOutlineItem.child(index)
                if (index < directBlockIndex) {
                  beforeBlocks.push(child)
                }
                else if (index > directBlockIndex) {
                  afterBlocks.push(child)
                }
                else {
                  beforeBlocks.push(beforeBlock)
                  afterBlocks.push(afterBlock)
                }
              }
            }

            // Update doc
            const beforeFragment = Fragment.fromArray(beforeBlocks)
            const afterFragment = Fragment.fromArray(afterBlocks)

            // Keep current item type for "before", and ensure the split target fits outline item schema.
            if (!cleanupTrailingParagraphRange && !currentOutlineItem.type.validContent(beforeFragment)) {
              return false
            }
            if (!outlineItemType.validContent(afterFragment)) {
              return false
            }

            // Split has two insertion modes:
            // 1) current list has child lists -> insert the new split list into current list children,
            // 2) current list has no child list -> insert the new split list after current list.
            const insertIntoChildren = currentOutlineList.childCount > 1
            const outlineListInsertPos = insertIntoChildren
              ? mappedOutlineItemPos + currentOutlineItem.nodeSize - 1
              : mappedOutlineListPos + currentOutlineList.nodeSize
            tr.insert(
              outlineListInsertPos,
              outlineListType.create(
                currentOutlineList.attrs,
                outlineItemType.create(currentOutlineItem.attrs, afterFragment),
              ),
            )

            if (!cleanupTrailingParagraphRange) {
              // replace the origional outline item with the before block
              tr.replaceWith(
                mappedOutlineItemPos,
                mappedOutlineItemPos + currentOutlineItem.nodeSize,
                currentOutlineItem.type.create(currentOutlineItem.attrs, beforeFragment),
              )
            }

            if (cleanupTrailingParagraphRange) {
              const cleanupFrom = tr.mapping.map(cleanupTrailingParagraphRange.from, -1)
              const cleanupTo = tr.mapping.map(cleanupTrailingParagraphRange.to, -1)
              tr.delete(cleanupFrom, cleanupTo)
            }

            // Place cursor inside the newly created split item.
            // Resolve inserted list position from final structure to avoid
            // landing back in current item when mapping hits ambiguous boundaries.
            let insertedListPos: number | null = null
            if (insertIntoChildren) {
              const mappedItemPos = tr.mapping.map(outlineItemPos, -1)
              const mappedItemNode = tr.doc.nodeAt(mappedItemPos)
              if (mappedItemNode) {
                insertedListPos = mappedItemPos + mappedItemNode.nodeSize
              }
            }
            else {
              const mappedListPos = tr.mapping.map(outlineListPos, -1)
              const mappedListNode = tr.doc.nodeAt(mappedListPos)
              if (mappedListNode) {
                insertedListPos = mappedListPos + mappedListNode.nodeSize
              }
            }
            if (insertedListPos === null) {
              insertedListPos = tr.mapping.map(outlineListInsertPos, -1)
            }
            try {
              const insertedListNode = tr.doc.nodeAt(insertedListPos)
              const searchStartPos = insertedListNode ? insertedListPos + 1 : insertedListPos
              const textSelection = Selection.findFrom(tr.doc.resolve(searchStartPos), 1, true)
                ?? Selection.findFrom(tr.doc.resolve(searchStartPos), 1)
              tr.setSelection(textSelection ?? Selection.near(tr.doc.resolve(searchStartPos), 1))
            }
            catch {
              // Best-effort cursor placement: never fail the split operation due to selection errors.
            }

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

export default Outline
