import type { Editor } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import type { DragState, DropTarget, IndicatorElements } from './outline-dnd-types'
import { getTextStartX, resolveOutlineItemAtCoords } from './outline-dnd-geometry'
import {
  ensureIndicatorElements,
  hideIndicator,
  positionIndicator,
  setIndicatorStyle,
} from './outline-dnd-indicator'
import { hasChildList, moveOutlineItem } from './outline-dnd-move'
import { DROP_LEFT_THRESHOLD_PX } from './outline-dnd-types'
import {
  findFirstChildListPos,
  findListItem,
  isOrderedItemNode,
  isOrderedListNode,
  isOutlineItemNode,
} from './outline-utils'

let activeDrag: DragState | null = null

function resolveDropTarget(view: EditorView, fromPos: number, event: MouseEvent) {
  const resolved = resolveOutlineItemAtCoords(view, event.clientY)
  if (!resolved)
    return null
  if (!isOutlineItemNode(resolved.node))
    return null

  const fromLookup = findListItem(view.state.doc.resolve(Math.min(fromPos + 1, view.state.doc.content.size)))
  if (!fromLookup)
    return null
  const sourcePos = fromLookup.pos
  const fromNode = fromLookup.node

  const rowRect = resolved.rowRect
  const midY = rowRect.top + rowRect.height / 2
  const isTop = event.clientY < midY
  const textStartX = getTextStartX(resolved.element, rowRect)
  const isRight = event.clientX > textStartX + DROP_LEFT_THRESHOLD_PX
  const targetHasChildren = hasChildList(resolved.node)
  const isAncestor = resolved.pos < sourcePos && sourcePos < resolved.pos + resolved.node.nodeSize

  // Use the cursor position to decide before/after/child with a fixed left threshold.
  let type: DropTarget['type']
  if (isTop) {
    type = 'before'
  }
  else if (isRight) {
    type = 'child'
  }
  else {
    // Allow dragging onto the parent (bottom-left) to become a sibling instead of a child.
    if (isAncestor) {
      type = 'after'
    }
    else {
      type = targetHasChildren ? 'child' : 'after'
    }
  }

  const targetLookup = findListItem(view.state.doc.resolve(Math.min(resolved.pos + 1, view.state.doc.content.size)))
  const targetListDepth = targetLookup ? targetLookup.depth - 1 : -1
  const targetListNode = targetListDepth > 0 ? view.state.doc.resolve(targetLookup!.pos).node(targetListDepth) : null
  let dropListNode = targetListNode
  if (type === 'child' && targetLookup) {
    const childListPos = findFirstChildListPos(targetLookup)
    if (childListPos !== null) {
      const childListNode = view.state.doc.nodeAt(childListPos)
      if (childListNode)
        dropListNode = childListNode
    }
  }

  // Prevent dropping onto self or any descendant.
  const isSelf = resolved.pos === sourcePos
  const isDescendant = resolved.pos > sourcePos && resolved.pos < sourcePos + fromNode.nodeSize
  // Ordered items can only move within ordered lists (and vice versa), except when nesting.
  const isOrderedSource = isOrderedItemNode(fromNode)
  const isOrderedTarget = dropListNode ? isOrderedListNode(dropListNode) : false
  const matchesListType = isOrderedSource === isOrderedTarget
  const allowChildIntoOrdered = type === 'child' && !isOrderedSource && isOrderedTarget
  const valid = !isSelf && !isDescendant && (matchesListType || allowChildIntoOrdered)

  return {
    pos: resolved.pos,
    type,
    element: resolved.element,
    rowRect: resolved.rowRect,
    valid,
  }
}

function updateDragPosition(
  view: EditorView,
  fromPos: number,
  indicator: IndicatorElements,
  event: MouseEvent,
  setCursor: (valid: boolean) => void,
) {
  const drop = resolveDropTarget(view, fromPos, event)
  if (!drop) {
    hideIndicator(indicator)
    setCursor(true)
    return null
  }

  positionIndicator(indicator, drop)
  setIndicatorStyle(indicator, drop.valid)
  setCursor(drop.valid)
  return drop
}

export function startOutlineDrag(
  editor: Editor,
  fromPos: number,
  event: MouseEvent,
) {
  if (event.button !== 0)
    return
  if (activeDrag)
    return

  const { view } = editor
  const fromLookup = findListItem(view.state.doc.resolve(Math.min(fromPos + 1, view.state.doc.content.size)))
  if (!fromLookup)
    return
  const sourcePos = fromLookup.pos

  const indicator = ensureIndicatorElements()
  const previousCursor = document.body.style.cursor
  const previousUserSelect = document.body.style.userSelect

  const restoreCursor = () => {
    document.body.style.cursor = previousCursor
  }

  document.body.style.cursor = 'grabbing'
  document.body.style.userSelect = 'none'

  const setCursor = (valid: boolean) => {
    document.body.style.cursor = valid ? 'grabbing' : 'not-allowed'
  }

  const onMove = (moveEvent: MouseEvent) => {
    if (!activeDrag)
      return
    activeDrag.drop = updateDragPosition(view, sourcePos, indicator, moveEvent, setCursor)
  }

  const finish = () => {
    if (!activeDrag)
      return
    const { drop } = activeDrag
    hideIndicator(indicator)
    restoreCursor()
    document.body.style.userSelect = previousUserSelect
    activeDrag.cleanup()
    activeDrag = null
    if (drop)
      moveOutlineItem(view, sourcePos, drop)
  }

  const onUp = (upEvent: MouseEvent) => {
    if (activeDrag) {
      const nextDrop = updateDragPosition(view, sourcePos, indicator, upEvent, setCursor)
      if (nextDrop)
        activeDrag.drop = nextDrop
    }
    finish()
  }

  const onKey = (keyEvent: KeyboardEvent) => {
    if (keyEvent.key === 'Escape') {
      hideIndicator(indicator)
      restoreCursor()
      document.body.style.userSelect = previousUserSelect
      activeDrag?.cleanup()
      activeDrag = null
    }
  }

  const cleanup = () => {
    window.removeEventListener('mousemove', onMove, true)
    window.removeEventListener('mouseup', onUp, true)
    window.removeEventListener('keydown', onKey, true)
  }

  activeDrag = {
    view,
    fromPos: sourcePos,
    drop: null,
    indicator,
    cleanup,
    restoreCursor,
  }

  window.addEventListener('mousemove', onMove, true)
  window.addEventListener('mouseup', onUp, true)
  window.addEventListener('keydown', onKey, true)

  activeDrag.drop = updateDragPosition(view, sourcePos, indicator, event, setCursor)
}
