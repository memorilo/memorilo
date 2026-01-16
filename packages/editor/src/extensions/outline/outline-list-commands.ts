import type { NodeType, Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Fragment, NodeRange, Slice } from '@tiptap/pm/model'
import { canJoin, liftTarget, ReplaceAroundStep } from '@tiptap/pm/transform'
import { findListItem, isOutlineItemNode } from './outline-utils'

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

function liftToOuterList(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  itemType: NodeType,
  range: NodeRange,
) {
  let tr = state.tr
  let end = range.end
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
    return false
  tr.lift(range, target)
  const $after = tr.doc.resolve(tr.mapping.map(end, -1) - 1)
  if (canJoin(tr.doc, $after.pos) && $after.nodeBefore!.type === $after.nodeAfter!.type) {
    tr.join($after.pos)
  }
  dispatch(tr.scrollIntoView())
  return true
}

function liftOutOfList(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  range: NodeRange,
) {
  let tr = state.tr
  const list = range.parent
  // Merge the list items into a single big item.
  for (let pos = range.end, i = range.endIndex - 1, e = range.startIndex; i > e; i--) {
    pos -= list.child(i).nodeSize
    tr.delete(pos - 1, pos + 1)
  }
  const $start = tr.doc.resolve(range.start)
  const item = $start.nodeAfter!
  if (tr.mapping.map(range.end) !== range.start + $start.nodeAfter!.nodeSize)
    return false
  const atStart = range.startIndex === 0
  const atEnd = range.endIndex === list.childCount
  const parent = $start.node(-1)
  const indexBefore = $start.index(-1)
  if (
    !parent.canReplace(
      indexBefore + (atStart ? 0 : 1),
      indexBefore + 1,
      item.content.append(atEnd ? Fragment.empty : Fragment.from(list)),
    )
  ) {
    return false
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
  dispatch(tr.scrollIntoView())
  return true
}

export function sinkOutlineListItem(state: EditorState, dispatch?: Dispatch) {
  const itemType = getActiveOutlineItemType(state)
  if (!itemType) {
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

  if (dispatch) {
    // Adapted from schema-list: create a nested list and move the range into it.
    const nestedBefore = nodeBefore.lastChild && nodeBefore.lastChild.type === parent.type
    const inner = Fragment.from(nestedBefore ? itemType.create() : null)
    const slice = new Slice(
      Fragment.from(
        itemType.create(null, Fragment.from(parent.type.create(null, inner))),
      ),
      nestedBefore ? 3 : 1,
      0,
    )
    const before = range.start
    const after = range.end
    dispatch(
      state.tr
        .step(
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
        .scrollIntoView(),
    )
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

  if (isOutlineItemNode($from.node(range.depth - 1))) {
    return liftToOuterList(state, dispatch, itemType, range)
  }
  return liftOutOfList(state, dispatch, range)
}
