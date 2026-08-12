import type { RefObject } from 'react'
import { useEffect, useRef } from 'react'

export const shelfSourceSheetSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.32,
} as const

export function useDialogFocus({
  dialogRef,
  initialFocusRef,
  isPending,
  onClose,
  open,
}: {
  dialogRef: RefObject<HTMLElement | null>
  initialFocusRef: RefObject<HTMLElement | null>
  isPending: boolean
  onClose: () => void
  open: boolean
}): void {
  const isPendingRef = useRef(isPending)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    isPendingRef.current = isPending
    onCloseRef.current = onClose
  }, [isPending, onClose])

  useEffect(() => {
    if (!open)
      return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    initialFocusRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPendingRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab')
        return

      const dialog = dialogRef.current
      if (!dialog)
        return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )].filter(element => !element.hasAttribute('hidden'))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) {
        event.preventDefault()
        dialog.focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
      else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [dialogRef, initialFocusRef, open])
}
