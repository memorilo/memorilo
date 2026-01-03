import type { ReactEditor } from 'slate-react'
import { useCallback, useLayoutEffect, useReducer, useRef } from 'react'
import { computeClampedFloatingPosition, getCaretRect } from './slash-command-position'

export interface UseSlashCommandMenuPositionOptions {
  open: boolean
  editor: ReactEditor
  triggerKey?: string
  triggerQuery?: string
  displaySelectedId: string | null
  groupCount: number
  itemCount: number
  flatCount: number
}

export function useSlashCommandMenuPosition({
  open,
  editor,
  triggerKey,
  triggerQuery,
  displaySelectedId,
  groupCount,
  itemCount,
  flatCount,
}: UseSlashCommandMenuPositionOptions) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  const [position, dispatchPosition] = useReducer(
    (
      prev: { top: number, left: number } | null,
      action:
        | { type: 'reset' }
        | { type: 'set', position: { top: number, left: number } },
    ) => {
      if (action.type === 'reset')
        return null

      const next = action.position
      return (prev && prev.top === next.top && prev.left === next.left) ? prev : next
    },
    null,
  )

  const scrollSelectedIntoView = useCallback(() => {
    const root = menuRef.current
    if (!root)
      return

    const list = root.querySelector('[data-slot="command-list"]') as HTMLElement | null
    const selected = root.querySelector('[data-slot="command-item"][data-selected="true"]') as HTMLElement | null
    if (!list || !selected)
      return

    const padding = 8
    const itemTop = selected.offsetTop
    const itemBottom = itemTop + selected.offsetHeight
    const viewTop = list.scrollTop
    const viewBottom = viewTop + list.clientHeight

    if (itemTop - padding < viewTop) {
      list.scrollTop = Math.max(0, itemTop - padding)
    }
    else if (itemBottom + padding > viewBottom) {
      list.scrollTop = itemBottom + padding - list.clientHeight
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      dispatchPosition({ type: 'reset' })
      return
    }

    const caretRect = getCaretRect(editor)
    if (!caretRect) {
      dispatchPosition({ type: 'reset' })
      return
    }

    dispatchPosition({ type: 'set', position: { top: caretRect.bottom + 8, left: caretRect.left } })
  }, [editor, open, triggerKey])

  useLayoutEffect(() => {
    if (!open)
      return

    const raf = requestAnimationFrame(scrollSelectedIntoView)
    return () => cancelAnimationFrame(raf)
  }, [displaySelectedId, groupCount, itemCount, open, scrollSelectedIntoView])

  const reposition = useCallback(() => {
    if (!open)
      return

    const caretRect = getCaretRect(editor)
    const el = menuRef.current
    if (!caretRect || !el)
      return

    const panelRect = el.getBoundingClientRect()
    const next = computeClampedFloatingPosition(caretRect, panelRect)
    dispatchPosition({ type: 'set', position: next })
  }, [editor, open])

  useLayoutEffect(() => {
    if (!open)
      return

    const raf = requestAnimationFrame(reposition)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [flatCount, open, reposition, triggerKey, triggerQuery])

  return { menuRef, position }
}
