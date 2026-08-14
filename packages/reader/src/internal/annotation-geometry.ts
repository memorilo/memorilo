import type { ReaderClientRect } from './reader-adapter'

function childRoots(root: Document | Element | ShadowRoot): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = []
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot)
      roots.push(element.shadowRoot)
    if (element instanceof HTMLIFrameElement && element.contentDocument)
      roots.push(element.contentDocument)
  }
  return roots
}

function queryAcrossRoots(root: Document | Element | ShadowRoot, selector: string): Element[] {
  const results = [...root.querySelectorAll(selector)]
  for (const child of childRoots(root))
    results.push(...queryAcrossRoots(child, selector))
  return results
}

function topWindowRect(element: Element): ReaderClientRect {
  const initial = element.getBoundingClientRect()
  let left = initial.left
  let top = initial.top
  let width = initial.width
  let height = initial.height
  let ownerWindow = element.ownerDocument.defaultView
  while (ownerWindow && ownerWindow !== window) {
    const frame = ownerWindow.frameElement
    if (!(frame instanceof HTMLElement))
      throw new Error('Reader annotation frame is not attached to an HTML element')
    const frameRect = frame.getBoundingClientRect()
    const scaleX = frame.clientWidth === 0 ? 1 : frameRect.width / frame.clientWidth
    const scaleY = frame.clientHeight === 0 ? 1 : frameRect.height / frame.clientHeight
    left = frameRect.left + left * scaleX
    top = frameRect.top + top * scaleY
    width *= scaleX
    height *= scaleY
    ownerWindow = frame.ownerDocument.defaultView
  }
  return { height, left, top, width }
}

function boundingRect(rects: readonly ReaderClientRect[]): ReaderClientRect | null {
  const visible = rects.filter(rect => rect.width > 0 && rect.height > 0)
  if (visible.length === 0)
    return null
  const left = Math.min(...visible.map(rect => rect.left))
  const top = Math.min(...visible.map(rect => rect.top))
  const right = Math.max(...visible.map(rect => rect.left + rect.width))
  const bottom = Math.max(...visible.map(rect => rect.top + rect.height))
  return { height: bottom - top, left, top, width: right - left }
}

export function findAnnotationClientRect(
  container: HTMLElement,
  annotationId: string,
): ReaderClientRect | null {
  const escaped = CSS.escape(annotationId)
  const elements = queryAcrossRoots(
    container,
    `[data-annotation-id="${escaped}"], [data-highlight-id="${escaped}"]`,
  )
  return boundingRect(elements.map(topWindowRect))
}
