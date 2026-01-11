import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { Fragment, Slice } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { dropPoint } from '@tiptap/pm/transform'
import {
  findFirstChildListPos,
  findListItem,
  isListContainerNode,
  isOutlineTextBlockNode,
} from './outline-utils'

type DropType = 'before' | 'after' | 'child'

interface DropTarget {
  pos: number
  type: DropType
  element: HTMLElement
  rowRect: DOMRect
  valid: boolean
}

interface IndicatorElements {
  root: HTMLDivElement
  nub: HTMLDivElement
}

interface DragState {
  view: EditorView
  fromPos: number
  drop: DropTarget | null
  indicator: IndicatorElements
  cleanup: () => void
  restoreCursor: () => void
}

interface OutlineHit {
  node: ProseMirrorNode
  pos: number
  element: HTMLElement
  rowRect: DOMRect
}

const DROP_LEFT_THRESHOLD_PX = 30
const INDENT_STEP_PX = 32
const INDICATOR_HEIGHT = 2
const INDICATOR_NUB_WIDTH = 2
const INDICATOR_NUB_SHORT = 8
const INDICATOR_NUB_LONG = 14
const INDICATOR_MIN_WIDTH = 24
const INDICATOR_MARGIN = 10

let activeDrag: DragState | null = null
let indicatorElements: IndicatorElements | null = null

function ensureIndicatorElements() {
  if (indicatorElements)
    return indicatorElements

  const root = document.createElement('div')
  root.setAttribute('data-outline-drop-indicator', 'true')
  root.style.position = 'fixed'
  root.style.display = 'none'
  root.style.pointerEvents = 'none'
  root.style.height = `${INDICATOR_HEIGHT}px`
  root.style.borderRadius = '9999px'
  root.style.zIndex = '1000'

  const nub = document.createElement('div')
  nub.setAttribute('data-outline-drop-indicator-nub', 'true')
  nub.style.position = 'absolute'
  nub.style.left = '0px'
  nub.style.width = `${INDICATOR_NUB_WIDTH}px`
  nub.style.borderRadius = '9999px'

  root.appendChild(nub)
  document.body.appendChild(root)

  indicatorElements = { root, nub }
  return indicatorElements
}

function hideIndicator(indicator: IndicatorElements) {
  indicator.root.style.display = 'none'
}

function setIndicatorStyle(indicator: IndicatorElements, valid: boolean) {
  // Red indicator + not-allowed cursor when drop is invalid (self/descendant).
  const color = valid ? 'var(--color-primary, currentColor)' : 'var(--color-destructive, #ef4444)'
  indicator.root.style.background = color
  indicator.nub.style.background = color
  indicator.root.style.opacity = valid ? '1' : '0.6'
}

function getElementRect(element: HTMLElement, selector: string) {
  const target = element.querySelector<HTMLElement>(selector)
  if (!target)
    return null
  const rect = target.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0)
    return null
  return rect
}

function getContentRect(element: HTMLElement) {
  const content = element.querySelector<HTMLElement>('[data-node-view-content]')
  if (!content)
    return null
  const firstBlock = content.firstElementChild
  if (firstBlock instanceof HTMLElement) {
    const rect = firstBlock.getBoundingClientRect()
    if (rect.height > 0)
      return rect
  }
  const rect = content.getBoundingClientRect()
  return rect.height > 0 ? rect : null
}

function getDotRect(element: HTMLElement) {
  return getElementRect(element, '[data-outline-dot]')
}

function getOutlineRowRect(element: HTMLElement) {
  const rowRect = getElementRect(element, '[data-outline-row]') ?? element.getBoundingClientRect()
  const dotRect = getDotRect(element)
  if (dotRect) {
    // Use the dot height to ignore nested child list height.
    return new DOMRect(
      rowRect.left,
      dotRect.top,
      rowRect.width,
      dotRect.height,
    )
  }
  const contentRect = getContentRect(element)
  if (contentRect) {
    // Fall back to the first text block height when the dot is not available.
    return new DOMRect(
      rowRect.left,
      contentRect.top,
      rowRect.width,
      contentRect.height,
    )
  }
  return rowRect
}

function getTextStartX(element: HTMLElement, fallbackRect: DOMRect) {
  const contentRect = getContentRect(element)
  return contentRect?.left ?? fallbackRect.left
}

function getDotCenter(element: HTMLElement, rect: DOMRect) {
  const dotRect = getDotRect(element)
  return dotRect ? dotRect.left + dotRect.width / 2 : rect.left
}

function resolveOutlineItemAtCoords(view: EditorView, y: number): OutlineHit | null {
  let best: OutlineHit | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  let bestInside = false

  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'listItem')
      return
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement))
      return
    const rect = getOutlineRowRect(dom)
    const inside = y >= rect.top && y <= rect.bottom
    const distance = Math.abs(y - (rect.top + rect.height / 2))
    // Prefer list items whose row height actually contains the cursor.
    if (inside && !bestInside) {
      bestInside = true
      bestDistance = distance
      best = { node, pos, element: dom, rowRect: rect }
      return
    }
    if (inside !== bestInside)
      return
    if (distance < bestDistance) {
      bestDistance = distance
      best = { node, pos, element: dom, rowRect: rect }
    }
  })

  return best
}

function hasChildList(node: ProseMirrorNode) {
  let hasChildren = false
  node.forEach((child) => {
    if (isListContainerNode(child))
      hasChildren = true
  })
  return hasChildren
}

function isEmptyListItem(node: ProseMirrorNode) {
  if (node.type.name !== 'listItem')
    return false
  if (node.childCount !== 1)
    return false
  const first = node.child(0)
  return isOutlineTextBlockNode(first) && first.content.size === 0
}

function resolveDropTarget(view: EditorView, fromPos: number, event: MouseEvent) {
  const resolved = resolveOutlineItemAtCoords(view, event.clientY)
  if (!resolved)
    return null
  if (resolved.node.type.name !== 'listItem')
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
  let type: DropType
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

  // Prevent dropping onto self or any descendant.
  const isSelf = resolved.pos === sourcePos
  const isDescendant = resolved.pos > sourcePos && resolved.pos < sourcePos + fromNode.nodeSize
  const valid = !isSelf && !isDescendant

  return {
    pos: resolved.pos,
    type,
    element: resolved.element,
    rowRect,
    valid,
  }
}

function positionIndicator(indicator: IndicatorElements, drop: DropTarget) {
  const dotCenter = getDotCenter(drop.element, drop.rowRect)
  const lineCenter = INDICATOR_HEIGHT / 2
  const left = (drop.type === 'child' ? dotCenter + INDENT_STEP_PX : dotCenter) - INDICATOR_NUB_WIDTH
  const right = drop.rowRect.right - INDICATOR_MARGIN
  const width = Math.max(INDICATOR_MIN_WIDTH, right - left)
  const y = drop.type === 'before' ? drop.rowRect.top : drop.rowRect.bottom

  indicator.root.style.display = 'block'
  indicator.root.style.left = `${left}px`
  indicator.root.style.top = `${y - lineCenter}px`
  indicator.root.style.width = `${width}px`

  if (drop.type === 'before') {
    indicator.nub.style.height = `${INDICATOR_NUB_SHORT}px`
    indicator.nub.style.top = `${lineCenter - INDICATOR_NUB_SHORT}px`
  }
  else if (drop.type === 'after') {
    indicator.nub.style.height = `${INDICATOR_NUB_SHORT}px`
    indicator.nub.style.top = `${lineCenter}px`
  }
  else {
    indicator.nub.style.height = `${INDICATOR_NUB_LONG}px`
    indicator.nub.style.top = `${lineCenter - INDICATOR_NUB_LONG / 2}px`
  }
}

function resolveListContainerType(view: EditorView, pos: number) {
  const $pos = view.state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (isListContainerNode(node))
      return node.type
  }
  return view.state.schema.nodes.bulletList ?? null
}

function moveOutlineItem(view: EditorView, fromPos: number, drop: DropTarget) {
  if (!drop.valid)
    return

  const { state } = view
  const sourceLookup = findListItem(state.doc.resolve(Math.min(fromPos + 1, state.doc.content.size)))
  if (!sourceLookup)
    return
  const sourcePos = sourceLookup.pos
  const fromNode = sourceLookup.node

  const fromEnd = sourcePos + fromNode.nodeSize
  if (drop.pos >= sourcePos && drop.pos < fromEnd)
    return

  let insertPos: number | null = null
  let insertNode: ProseMirrorNode | null = null

  const $target = state.doc.resolve(drop.pos + 1)
  const targetListItem = findListItem($target)
  if (!targetListItem)
    return
  const targetNode = targetListItem.node

  if (drop.type === 'before') {
    insertPos = targetListItem.pos
  }
  else if (drop.type === 'after') {
    insertPos = targetListItem.pos + targetNode.nodeSize
  }
  else {
    const childListPos = findFirstChildListPos(targetListItem)
    if (childListPos !== null) {
      // Insert as the first child in the existing list.
      insertPos = childListPos + 1
    }
    else {
      const listType = resolveListContainerType(view, drop.pos)
      if (!listType)
        return
      insertPos = targetListItem.pos + targetListItem.node.nodeSize - 1
      insertNode = listType.create(null, fromNode)
    }
  }

  if (insertPos === null)
    return

  const $from = state.doc.resolve(Math.min(sourcePos + 1, state.doc.content.size))
  const fromListItem = findListItem($from)
  let parentListPos: number | null = null
  let shouldRemoveParentList = false
  let insertInsideParentList = false

  if (fromListItem) {
    const listDepth = fromListItem.depth - 1
    if (listDepth > 0) {
      const listNode = $from.node(listDepth)
      if (isListContainerNode(listNode)) {
        parentListPos = $from.before(listDepth)
        // Remove empty nested list when we move its last item out.
        shouldRemoveParentList = listDepth > 1 && listNode.childCount === 1
        const parentEnd = parentListPos + listNode.nodeSize
        // Keep the parent list if we insert back inside its range.
        insertInsideParentList = insertPos > parentListPos && insertPos < parentEnd
      }
    }
  }

  const tr = state.tr
  tr.delete(sourcePos, fromEnd)

  if (shouldRemoveParentList && !insertInsideParentList && parentListPos !== null) {
    const mappedListPos = tr.mapping.map(parentListPos)
    const listNodeAfterDelete = tr.doc.nodeAt(mappedListPos)
    if (listNodeAfterDelete && isListContainerNode(listNodeAfterDelete)) {
      const shouldRemoveEmpty = listNodeAfterDelete.childCount === 0
        || (listNodeAfterDelete.childCount === 1 && isEmptyListItem(listNodeAfterDelete.child(0)))
      // Remove the empty list container to avoid leaving a blank list item behind.
      if (shouldRemoveEmpty)
        tr.delete(mappedListPos, mappedListPos + listNodeAfterDelete.nodeSize)
    }
  }

  const mappedInsertPos = tr.mapping.map(insertPos)
  const insertContent = insertNode ?? fromNode
  const slice = new Slice(Fragment.from(insertContent), 0, 0)
  // Let ProseMirror choose the nearest valid insertion point.
  const safeInsertPos = dropPoint(tr.doc, mappedInsertPos, slice)
  if (safeInsertPos === null)
    return
  tr.replaceRange(safeInsertPos, safeInsertPos, slice)

  if (drop.type === 'child' && targetNode.attrs.folded) {
    const mappedTargetPos = tr.mapping.map(drop.pos)
    tr.setNodeMarkup(mappedTargetPos, undefined, {
      ...targetNode.attrs,
      folded: false,
    })
  }

  const selectionPos = insertNode ? safeInsertPos + 2 : safeInsertPos + 1
  const safeSelectionPos = Math.min(selectionPos, tr.doc.content.size)
  tr.setSelection(TextSelection.near(tr.doc.resolve(safeSelectionPos)))
  tr.scrollIntoView()
  view.dispatch(tr)
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
