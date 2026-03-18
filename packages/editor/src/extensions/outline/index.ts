import type { Node as PMNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { Extension } from '@tiptap/core'
import Paragraph from '@tiptap/extension-paragraph'
import { Fragment } from '@tiptap/pm/model'
import { Plugin, Selection, TextSelection } from '@tiptap/pm/state'
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
          ({ state, editor, dispatch, tr }) => {
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

            const { $from } = tr.selection
            const blockPos = getParentBlock(editor.$pos($from.pos)).pipe(Option.getOrThrow)
            const outlineItemPos = getParentOutlineItem(blockPos).pipe(Option.getOrThrow)
            const outlineListPos = getParentOutlineList(outlineItemPos).pipe(Option.getOrThrow)
            const outlineItem = outlineItemPos.node
            const outlineList = outlineListPos.node

            // The cursor must point to a valid direct child of the current outline item.
            const topBlockIndexInOutlineItem = $from.index(outlineItemPos.depth)
            if (topBlockIndexInOutlineItem < 0 || topBlockIndexInOutlineItem >= outlineItem.childCount) {
              return false
            }
            const topBlock = outlineItem.child(topBlockIndexInOutlineItem)

            const beforeBlocks: PMNode[] = []
            const afterBlocks: PMNode[] = []
            const isTrailingEmptyParagraph = blockPos.depth === outlineItemPos.depth + 1
              && topBlockIndexInOutlineItem === outlineItem.childCount - 1
              && topBlockIndexInOutlineItem > 0
              && $from.parent.type === paragraphType
              && $from.parent.content.size === 0
              && $from.parentOffset === 0

            const cleanupTrailingParagraphRange: { from: number, to: number } | null = isTrailingEmptyParagraph
              ? {
                  from: $from.before(blockPos.depth),
                  to: $from.before(blockPos.depth) + topBlock.nodeSize,
                }
              : null

            // Handle the two split modes:
            // 1) when the cursor is in a non-leading trailing empty paragraph,
            //    create the new split item first and delete that original paragraph at the end;
            // 2) otherwise, run the normal inline split logic at the cursor.
            if (cleanupTrailingParagraphRange) {
              afterBlocks.push(paragraphType.create(topBlock.attrs, topBlock.content, topBlock.marks))
            }
            else {
              const topBlockDepth = outlineItemPos.depth + 1
              // Defensive check: leaf block cannot be above the top direct block.
              if (blockPos.depth < topBlockDepth) {
                return false
              }

              const pathToLeaf: number[] = []
              for (let depth = topBlockDepth; depth < blockPos.depth; depth += 1) {
                const parentNodeAtDepth = $from.node(depth)
                const childIndex = $from.index(depth)
                // Every path segment must resolve to a valid child index.
                if (childIndex < 0 || childIndex >= parentNodeAtDepth.childCount) {
                  return false
                }
                pathToLeaf.push(childIndex)
              }

              /**
               * Inline split algorithm:
               * 1) Split the leaf block where the cursor is located.
               * 2) Rebuild every ancestor block up to `topBlock` by replacing the
               *    descendant at `pathToLeaf[index]` with the split pair.
               *
               * Example:
               *   topBlock(outline child): blockquote
               *   structure: blockquote -> paragraph("123")
               *   cursor after "1" => before: blockquote(paragraph("1")),
               *                       after:  blockquote(paragraph("23"))
               */
              const leafOffset = $from.parentOffset
              const splitPathNodes: PMNode[] = [topBlock]
              let pathCursor = topBlock
              for (const childIndex of pathToLeaf) {
                // Walk from top block down to the leaf following the resolved path.
                if (childIndex < 0 || childIndex >= pathCursor.childCount) {
                  return false
                }
                pathCursor = pathCursor.child(childIndex)
                splitPathNodes.push(pathCursor)
              }

              const leafNode = splitPathNodes[splitPathNodes.length - 1]
              // Offset is relative to the leaf node content; it must be in bounds.
              if (!leafNode || leafOffset < 0 || leafOffset > leafNode.content.size) {
                return false
              }

              const leafBeforeContent = leafNode.content.cut(0, leafOffset)
              const leafAfterContent = leafNode.content.cut(leafOffset, leafNode.content.size)
              // Both split halves must satisfy the leaf node schema.
              if (!leafNode.type.validContent(leafBeforeContent) || !leafNode.type.validContent(leafAfterContent)) {
                return false
              }

              let beforeNode = leafNode.type.create(leafNode.attrs, leafBeforeContent, leafNode.marks)
              let afterNode = leafNode.type.create(leafNode.attrs, leafAfterContent, leafNode.marks)

              for (let index = pathToLeaf.length - 1; index >= 0; index -= 1) {
                const parentNode = splitPathNodes[index]
                const childIndex = pathToLeaf[index]
                // Rebuild each ancestor from leaf -> top block.
                if (!parentNode || childIndex === undefined || childIndex < 0 || childIndex >= parentNode.childCount) {
                  return false
                }

                const beforeChildren: PMNode[] = []
                const afterChildren: PMNode[] = []
                for (let childOffset = 0; childOffset < parentNode.childCount; childOffset += 1) {
                  const child = parentNode.child(childOffset)
                  if (childOffset < childIndex) {
                    beforeChildren.push(child)
                  }
                  else if (childOffset > childIndex) {
                    afterChildren.push(child)
                  }
                  else {
                    beforeChildren.push(beforeNode)
                    afterChildren.push(afterNode)
                  }
                }

                const beforeContent = Fragment.fromArray(beforeChildren)
                const afterContent = Fragment.fromArray(afterChildren)
                // Rebuilt ancestor nodes must remain schema-valid on both sides.
                if (!parentNode.type.validContent(beforeContent) || !parentNode.type.validContent(afterContent)) {
                  return false
                }

                beforeNode = parentNode.type.create(parentNode.attrs, beforeContent, parentNode.marks)
                afterNode = parentNode.type.create(parentNode.attrs, afterContent, parentNode.marks)
              }

              for (let index = 0; index < outlineItem.childCount; index += 1) {
                const child = outlineItem.child(index)
                if (index < topBlockIndexInOutlineItem) {
                  beforeBlocks.push(child)
                }
                else if (index > topBlockIndexInOutlineItem) {
                  afterBlocks.push(child)
                }
                else {
                  beforeBlocks.push(beforeNode)
                  afterBlocks.push(afterNode)
                }
              }
            }

            // Update doc
            const beforeFragment = Fragment.fromArray(beforeBlocks)
            const afterFragment = Fragment.fromArray(afterBlocks)

            // Keep current item type for "before", and ensure the split target fits outline item schema.
            if (!cleanupTrailingParagraphRange && !outlineItem.type.validContent(beforeFragment)) {
              return false
            }
            if (!outlineItemType.validContent(afterFragment)) {
              return false
            }

            // Split has two insertion modes:
            // 1) current list has child lists -> insert the new split list into current list children,
            // 2) current list has no child list -> insert the new split list after current list.
            const insertIntoChildren = outlineList.childCount > 1
            const outlineListInsertPos = insertIntoChildren
              ? $from.end(outlineItemPos.depth)
              : $from.after(outlineListPos.depth)
            tr.insert(
              outlineListInsertPos,
              outlineListType.create(
                outlineList.attrs,
                outlineItemType.create(outlineItem.attrs, afterFragment),
              ),
            )

            if (!cleanupTrailingParagraphRange) {
              // replace the origional outline item with the before block
              tr.replaceWith(
                $from.before(outlineItemPos.depth),
                $from.after(outlineItemPos.depth),
                outlineItem.type.create(outlineItem.attrs, beforeFragment),
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
              const mappedItemPos = tr.mapping.map($from.before(outlineItemPos.depth), -1)
              const mappedItemNode = tr.doc.nodeAt(mappedItemPos)
              if (mappedItemNode) {
                insertedListPos = mappedItemPos + mappedItemNode.nodeSize
              }
            }
            else {
              const mappedListPos = tr.mapping.map($from.before(outlineListPos.depth), -1)
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
