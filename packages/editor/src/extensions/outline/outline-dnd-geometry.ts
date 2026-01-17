import type { EditorView } from '@tiptap/pm/view'
import type { OutlineHit } from './outline-dnd-types'
import { isOutlineItemNode } from './outline-utils'

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

export function getOutlineRowRect(element: HTMLElement) {
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

export function getTextStartX(element: HTMLElement, fallbackRect: DOMRect) {
  const contentRect = getContentRect(element)
  return contentRect?.left ?? fallbackRect.left
}

export function getDotCenter(element: HTMLElement, rect: DOMRect) {
  const dotRect = getDotRect(element)
  return dotRect ? dotRect.left + dotRect.width / 2 : rect.left
}

export function resolveOutlineItemAtCoords(view: EditorView, y: number): OutlineHit | null {
  let best: OutlineHit | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  let bestInside = false

  view.state.doc.descendants((node, pos) => {
    if (!isOutlineItemNode(node))
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
