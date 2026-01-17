import type { NodeType, Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Fragment, NodeRange, Slice } from '@tiptap/pm/model'
import { canJoin, liftTarget, ReplaceAroundStep } from '@tiptap/pm/transform'
import { findParentListType, resolveItemTypeForList, stripCheckedAttr } from './outline-list-utils'
import { findListItem, isListContainerNode, isOutlineItemNode } from './outline-utils'

type Dispatch = ((tr: Transaction) => void) | undefined

// These commands mirror prosemirror-schema-list, but allow mixed listItem/taskItem
// inside the same outline list container.

function isOutlineListContainer(node: ProseMirrorNode) {
  return node.childCount > 0 && isOutlineItemNode(node.firstChild!)
}

function getActiveOutlineItemType(state: EditorState): NodeType | null {
  const listItem = findListItem(state.selection.$from)
  if (!listItem) {
    return null
  }
  // Use the actual item type under the cursor so mixed lists keep working.
  return listItem.node.type
}

function getIndentTargetTypes(
  state: EditorState,
  parentList: ProseMirrorNode,
  nodeBefore: ProseMirrorNode,
  activeItemType: NodeType,
) {
  const { orderedList: orderedListType } = state.schema.nodes

  const existingChildList = nodeBefore.lastChild
  let targetListType: NodeType | null = parentList.type
  if (existingChildList && isListContainerNode(existingChildList)) {
    targetListType = existingChildList.type
  }
  else if (nodeBefore.type.name === 'orderedItem') {
    targetListType = orderedListType ?? null
  }

  if (!targetListType) {
    return null
  }

  if (targetListType.name === 'orderedList' && activeItemType.name === 'taskItem') {
    // Task items cannot be placed inside ordered lists.
    return null
  }

  const targetItemType = resolveItemTypeForList(state.schema, targetListType, activeItemType)
  if (!targetItemType) {
    return null
  }

  return { listType: targetListType, itemType: targetItemType }
}

function collectRangeItemPositions(range: NodeRange) {
  const positions: number[] = []
  let pos = range.start
  for (let index = range.startIndex; index < range.endIndex; index += 1) {
    positions.push(pos)
    pos += range.parent.child(index).nodeSize
  }
  return positions
}

function normalizeMovedItems(
  tr: Transaction,
  state: EditorState,
  itemPositions: number[],
) {
  const { listItem: listItemType } = state.schema.nodes
  if (!listItemType) {
    return
  }

  const processed = new Set<number>()

  // Map each moved item's original position to the new document and normalize its type
  // based on the list container it landed in.
  itemPositions.forEach((pos) => {
    const mapped = tr.mapping.map(pos)
    const resolved = tr.doc.resolve(Math.min(mapped + 1, tr.doc.content.size))
    const listItem = findListItem(resolved)
    if (!listItem || processed.has(listItem.pos))
      return
    processed.add(listItem.pos)

    const $itemPos = tr.doc.resolve(Math.min(listItem.pos + 1, tr.doc.content.size))
    const parentListType = findParentListType($itemPos)
    if (!parentListType)
      return

    const targetType = resolveItemTypeForList(state.schema, parentListType, listItem.node.type)
    if (!targetType || listItem.node.type === targetType)
      return

    const nextAttrs = targetType === listItemType ? stripCheckedAttr(listItem.node.attrs) : listItem.node.attrs
    tr.setNodeMarkup(listItem.pos, targetType, nextAttrs)
  })
}

function liftToOuterList(
  state: EditorState,
  itemType: NodeType,
  range: NodeRange,
) {
  const tr = state.tr
  const end = range.end
  const endOfList = range.$to.end(range.depth)
  if (end < endOfList) {
    // Ensure that following siblings become children of the last lifted item.
    tr.step(
      new ReplaceAroundStep(
        end - 1,
        endOfList,
        end,
        endOfList,
        new Slice(Fragment.from(itemType.create(null, range.parent.copy())), 1, 0),
        1,
        true,
      ),
    )
    range = new NodeRange(
      tr.doc.resolve(range.$from.pos),
      tr.doc.resolve(endOfList),
      range.depth,
    )
  }
  const target = liftTarget(range)
  if (target == null)
    return null
  tr.lift(range, target)
  const $after = tr.doc.resolve(tr.mapping.map(end, -1) - 1)
  if (canJoin(tr.doc, $after.pos) && $after.nodeBefore!.type === $after.nodeAfter!.type) {
    tr.join($after.pos)
  }
  return tr
}

function liftOutOfList(
  state: EditorState,
  range: NodeRange,
) {
  const tr = state.tr
  const list = range.parent
  // Merge the list items into a single big item.
  for (let pos = range.end, i = range.endIndex - 1, e = range.startIndex; i > e; i--) {
    pos -= list.child(i).nodeSize
    tr.delete(pos - 1, pos + 1)
  }
  const $start = tr.doc.resolve(range.start)
  const item = $start.nodeAfter!
  if (tr.mapping.map(range.end) !== range.start + $start.nodeAfter!.nodeSize)
    return null
  const atStart = range.startIndex === 0
  const atEnd = range.endIndex === list.childCount
  const parent = $start.node(-1)
  const indexBefore = $start.index(-1)
  if (!parent.canReplace(
    indexBefore + (atStart ? 0 : 1),
    indexBefore + 1,
    item.content.append(atEnd ? Fragment.empty : Fragment.from(list)),
  )) {
    return null
  }
  const start = $start.pos
  const end = start + item.nodeSize
  tr.step(
    new ReplaceAroundStep(
      start - (atStart ? 1 : 0),
      end + (atEnd ? 1 : 0),
      start + 1,
      end - 1,
      new Slice(
        (atStart ? Fragment.empty : Fragment.from(list.copy(Fragment.empty)))
          .append(atEnd ? Fragment.empty : Fragment.from(list.copy(Fragment.empty))),
        atStart ? 0 : 1,
        atEnd ? 0 : 1,
      ),
      atStart ? 0 : 1,
    ),
  )
  return tr
}

export function sinkOutlineListItem(state: EditorState, dispatch?: Dispatch) {
  const activeItemType = getActiveOutlineItemType(state)
  if (!activeItemType) {
    return false
  }

  const { $from, $to } = state.selection
  const range = $from.blockRange($to, isOutlineListContainer)
  if (!range)
    return false

  const startIndex = range.startIndex
  if (startIndex === 0)
    return false

  const parent = range.parent
  const nodeBefore = parent.child(startIndex - 1)
  if (!isOutlineItemNode(nodeBefore))
    return false
  const targetTypes = getIndentTargetTypes(state, parent, nodeBefore, activeItemType)
  if (!targetTypes) {
    return false
  }
  const itemPositions = collectRangeItemPositions(range)

  if (dispatch) {
    // Adapted from schema-list: create a nested list and move the range into it.
    const nestedBefore = nodeBefore.lastChild && nodeBefore.lastChild.type === targetTypes.listType
    const inner = Fragment.from(nestedBefore ? targetTypes.itemType.create() : null)
    const slice = new Slice(
      Fragment.from(
        targetTypes.itemType.create(null, Fragment.from(targetTypes.listType.create(null, inner))),
      ),
      nestedBefore ? 3 : 1,
      0,
    )
    const before = range.start
    const after = range.end
    const tr = state.tr.step(
      new ReplaceAroundStep(
        before - (nestedBefore ? 3 : 1),
        after,
        before,
        after,
        slice,
        1,
        true,
      ),
    )
    normalizeMovedItems(tr, state, itemPositions)
    dispatch(tr.scrollIntoView())
  }

  return true
}

export function liftOutlineListItem(state: EditorState, dispatch?: Dispatch) {
  const itemType = getActiveOutlineItemType(state)
  if (!itemType)
    return false

  const { $from, $to } = state.selection
  const range = $from.blockRange($to, isOutlineListContainer)
  if (!range)
    return false
  if (!dispatch)
    return true

  const itemPositions = collectRangeItemPositions(range)

  if (isOutlineItemNode($from.node(range.depth - 1))) {
    const tr = liftToOuterList(state, itemType, range)
    if (!tr)
      return false
    normalizeMovedItems(tr, state, itemPositions)
    dispatch(tr.scrollIntoView())
    return true
  }
  const tr = liftOutOfList(state, range)
  if (!tr)
    return false
  normalizeMovedItems(tr, state, itemPositions)
  dispatch(tr.scrollIntoView())
  return true
}
