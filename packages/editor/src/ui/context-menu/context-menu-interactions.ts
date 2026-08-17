import type { BasicExtension } from 'prosekit/basic'
import type { Editor } from 'prosekit/core'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { TextSelection } from 'prosekit/pm/state'

export interface ContextMenuPoint {
  x: number
  y: number
}

export function contextMenuPoint(
  editor: Editor<BasicExtension>,
  event: MouseEvent,
): ContextMenuPoint {
  if (event.clientX !== 0 || event.clientY !== 0)
    return { x: event.clientX, y: event.clientY }

  const coords = editor.view.coordsAtPos(editor.state.selection.from)
  return { x: coords.left, y: coords.bottom }
}

function blockIdAtPosition(
  editor: Editor<BasicExtension>,
  position: number,
): string | null {
  const $position = editor.state.doc.resolve(position)
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const node = $position.node(depth)
    if (node.type.name !== 'list')
      continue
    const blockId = node.attrs.blockId
    if (typeof blockId !== 'string' || blockId.length === 0)
      throw new Error('The context menu Outline block is missing its stable id')
    return blockId
  }
  return null
}

export function blockIdFromContextTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element))
    return null
  const block = target.closest<HTMLElement>('[data-block-id]')
  if (!block)
    return null
  const blockId = block.dataset.blockId
  if (!blockId)
    throw new Error('The context menu target block is missing its stable id')
  return blockId
}

export function moveSelectionToContextPoint(
  editor: Editor<BasicExtension>,
  point: ContextMenuPoint,
): string | null {
  const view = editor.view
  const result = view.posAtCoords({ left: point.x, top: point.y })
  if (!result)
    return null
  const blockId = blockIdAtPosition(editor, result.pos)

  const { selection } = view.state
  const clickIsInsideSelection = !selection.empty
    && result.pos >= selection.from
    && result.pos <= selection.to
  if (clickIsInsideSelection)
    return blockId

  const nextSelection = TextSelection.near(view.state.doc.resolve(result.pos))
  view.dispatch(view.state.tr.setSelection(nextSelection))
  return blockId
}

export function handleContextMenuKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
): void {
  const items = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  )
  if (items.length === 0)
    return

  const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
  let nextIndex: number | undefined

  if (event.key === 'ArrowDown')
    nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
  else if (event.key === 'ArrowUp')
    nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
  else if (event.key === 'Home')
    nextIndex = 0
  else if (event.key === 'End')
    nextIndex = items.length - 1

  if (nextIndex === undefined)
    return

  const nextItem = items[nextIndex]
  if (!nextItem)
    throw new Error(`Missing context menu item at index ${nextIndex}`)

  event.preventDefault()
  nextItem.focus()
}
