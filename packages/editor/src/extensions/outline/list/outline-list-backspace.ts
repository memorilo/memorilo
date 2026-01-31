import type { Editor } from '@tiptap/core'
import type { NodeType, Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'
import type { EditorState, Selection, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Fragment, Slice } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import {
  findListItem,
  findSiblingListItemPos,
  getOutlineItemEndSelection,
  isListContainerNode,
  isOutlineTextBlockNode,
  isSelectionInTable,
} from '../core/outline-utils'
import { normalizeItemForList, stripCheckedAttr } from './outline-list-utils'

interface ListItemContext {
  node: ProseMirrorNode
  pos: number
  depth: number
}

interface BackspaceContext {
  state: EditorState
  listItem: ListItemContext
  listDepth: number
  listNode: ProseMirrorNode
  listPos: number
  listEnd: number
  listItemPos: number
  listItemEnd: number
  listItemType: NodeType | null
}

function getPromotedChildrenFragment(schema: Schema, listItemNode: ProseMirrorNode, parentListType: ProseMirrorNode['type']) {
  // Collect child list items and normalize them so promotion keeps the parent list schema valid.
  let childListNode: ProseMirrorNode | null = null
  for (let index = 0; index < listItemNode.childCount; index += 1) {
    const child = listItemNode.child(index)
    if (isListContainerNode(child)) {
      childListNode = child
      break
    }
  }

  if (!childListNode) {
    return null
  }
  if (childListNode.childCount === 0) {
    return null
  }

  const normalizedItems = []
  for (let index = 0; index < childListNode.childCount; index += 1) {
    const child = childListNode.child(index)
    normalizedItems.push(normalizeItemForList(schema, parentListType, child))
  }
  return Fragment.fromArray(normalizedItems)
}

function getFirstTextblockInlineContent(node: ProseMirrorNode) {
  // Extract the inline content to merge into a sibling without pulling nested lists along.
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index)
    if (isOutlineTextBlockNode(child)) {
      return child.content
    }
  }
  return null
}

function findParentOutlineItem(state: EditorState, listDepth: number) {
  // Resolve the parent outline item that owns the current list container.
  if (listDepth <= 0) {
    return null
  }
  const listPos = state.selection.$from.before(listDepth)
  return findListItem(state.doc.resolve(listPos))
}

function dispatchTransaction(view: EditorView, tr: Transaction, selection?: Selection | null) {
  if (selection) {
    tr.setSelection(selection)
  }
  view.dispatch(tr.scrollIntoView())
  return true
}

function createBackspaceContext(state: EditorState, listItem: ListItemContext | null) {
  // Cache resolved positions so each branch can operate on the same base coordinates.
  if (!listItem) {
    return null
  }
  const listDepth = listItem.depth - 1
  if (listDepth < 0) {
    return null
  }
  const listNode = state.selection.$from.node(listDepth)
  const listPos = state.selection.$from.before(listDepth)
  const listEnd = listPos + listNode.nodeSize
  const listItemPos = listItem.pos
  const listItemEnd = listItemPos + listItem.node.nodeSize
  const listItemType = state.schema.nodes.listItem ?? null
  return {
    state,
    listItem,
    listDepth,
    listNode,
    listPos,
    listEnd,
    listItemPos,
    listItemEnd,
    listItemType,
  } satisfies BackspaceContext
}

function handleTaskItemBackspace(view: EditorView, ctx: BackspaceContext) {
  if (!ctx.listItemType || ctx.listItem.node.type.name !== 'taskItem') {
    return false
  }
  const nextAttrs = stripCheckedAttr(ctx.listItem.node.attrs)
  const tr = ctx.state.tr.setNodeMarkup(ctx.listItemPos, ctx.listItemType, nextAttrs)
  return dispatchTransaction(view, tr)
}

function handleOrderedItemBackspace(view: EditorView, ctx: BackspaceContext) {
  if (ctx.listItem.node.type.name !== 'orderedItem') {
    return false
  }
  // Ordered items at the line start either merge into the previous item or demote to a bullet item.
  if (ctx.listItemType && ctx.listNode.childCount === 1) {
    const tr = ctx.state.tr.setNodeMarkup(ctx.listItemPos, ctx.listItemType, ctx.listItem.node.attrs)
    return dispatchTransaction(view, tr)
  }

  const prevPos = findSiblingListItemPos(ctx.state, ctx.listItem, 'prev') as number | null
  let targetItemPos: number | null = prevPos
  if (targetItemPos === null) {
    const parentItem = findParentOutlineItem(ctx.state, ctx.listDepth)
    if (parentItem && parentItem.pos !== ctx.listItemPos) {
      targetItemPos = parentItem.pos
    }
  }

  if (targetItemPos === null || !ctx.listItemType) {
    return false
  }

  const inlineContent = getFirstTextblockInlineContent(ctx.listItem.node)
  const promotedFragment = getPromotedChildrenFragment(ctx.state.schema, ctx.listItem.node, ctx.listNode.type)
  let tr = ctx.state.tr
  if (promotedFragment) {
    tr = tr.replaceWith(ctx.listItemPos, ctx.listItemEnd, promotedFragment)
  }
  else {
    tr = tr.delete(ctx.listItemPos, ctx.listItemEnd)
  }
  const mappedTargetPos = tr.mapping.map(targetItemPos)
  const nextState = ctx.state.apply(tr)
  const targetSelection = getOutlineItemEndSelection(nextState, mappedTargetPos)
  if (!inlineContent || !targetSelection || !targetSelection.$from.parent.isTextblock) {
    return dispatchTransaction(view, tr, targetSelection ?? undefined)
  }
  const insertPos = targetSelection.from
  tr.replaceRange(insertPos, insertPos, new Slice(inlineContent, 0, 0))
  const caretPos = insertPos + inlineContent.size
  return dispatchTransaction(view, tr, TextSelection.near(tr.doc.resolve(caretPos)))
}

function handleDefaultBackspace(view: EditorView, ctx: BackspaceContext) {
  const promotedFragment = getPromotedChildrenFragment(ctx.state.schema, ctx.listItem.node, ctx.listNode.type)
  let tr = ctx.state.tr
  let selectionPos: number | null = null
  if (promotedFragment) {
    tr = tr.replaceWith(ctx.listItemPos, ctx.listItemEnd, promotedFragment)
    selectionPos = tr.mapping.map(ctx.listItemPos) + 1
  }
  else {
    const prevPos = findSiblingListItemPos(ctx.state, ctx.listItem, 'prev')
    const nextPos = findSiblingListItemPos(ctx.state, ctx.listItem, 'next')
    if (ctx.listNode.childCount <= 1) {
      tr = tr.delete(ctx.listPos, ctx.listEnd)
      selectionPos = Math.min(ctx.listPos, tr.doc.content.size)
    }
    else {
      tr = tr.delete(ctx.listItemPos, ctx.listItemEnd)
      const targetPos = prevPos ?? nextPos
      if (targetPos !== null) {
        selectionPos = tr.mapping.map(targetPos) + 1
      }
    }
  }
  const selection = selectionPos !== null
    ? TextSelection.near(tr.doc.resolve(selectionPos))
    : null
  return dispatchTransaction(view, tr, selection)
}

export function createOutlineListBackspaceHandler(editor: Editor) {
  return () => {
    const { state, view } = editor
    if (!view)
      return false
    const { selection } = state
    if (!selection.empty)
      return false

    const { $from } = selection
    if (isSelectionInTable($from)) {
      return false
    }
    if (!isOutlineTextBlockNode($from.parent) || $from.parentOffset !== 0) {
      return false
    }

    const listItem = findListItem($from)
    if (!listItem)
      return false

    const ctx = createBackspaceContext(state, listItem)
    if (!ctx) {
      return true
    }

    if (handleTaskItemBackspace(view, ctx)) {
      return true
    }
    if (handleOrderedItemBackspace(view, ctx)) {
      return true
    }
    return handleDefaultBackspace(view, ctx)
  }
}
