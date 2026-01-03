import type { ReactEditor } from 'slate-react'
import { ReactEditor as SlateReactEditor } from 'slate-react'

export function getCaretRect(editor: ReactEditor) {
  try {
    if (!editor.selection)
      return null

    const domRange = SlateReactEditor.toDOMRange(editor, editor.selection)
    const rect = domRange.getBoundingClientRect()
    if (rect && (rect.width || rect.height))
      return rect

    const clientRects = domRange.getClientRects()
    return clientRects[0] ?? rect
  }
  catch {
    return null
  }
}

export function computeClampedFloatingPosition(caretRect: DOMRect, panelRect: DOMRect) {
  const viewportPad = 8
  const gap = 8

  let left = caretRect.left
  let top = caretRect.bottom + gap

  if (left + panelRect.width > window.innerWidth - viewportPad) {
    left = window.innerWidth - viewportPad - panelRect.width
  }
  if (left < viewportPad)
    left = viewportPad

  if (top + panelRect.height > window.innerHeight - viewportPad) {
    top = caretRect.top - gap - panelRect.height
  }
  if (top < viewportPad)
    top = viewportPad

  return { top, left }
}

