import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { Editor } from 'slate'
import type { ImageElementType } from '../../../slate'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Transforms } from 'slate'
import { ReactEditor } from 'slate-react'
import { getEditorMaxWidthPx } from '../../../lib/dom'
import { MIN_IMAGE_HEIGHT_PX, MIN_IMAGE_WIDTH_PX } from './constants'

export type ResizeMode = 'proportional' | 'width-only' | 'height-only'

export interface DraftSize {
  width: number
  height: number
}

interface UseImageResizeParams {
  editor: Editor
  element: ImageElementType
  imgRef: RefObject<HTMLImageElement | null>
  fallbackSizeRef: RefObject<DraftSize | null>
}

function getCursorForMode(mode: ResizeMode) {
  if (mode === 'proportional')
    return 'nwse-resize, se-resize'
  if (mode === 'width-only')
    return 'col-resize'
  return 'row-resize'
}

export function useImageResize({ editor, element, imgRef, fallbackSizeRef }: UseImageResizeParams) {
  const [draftSize, setDraftSize] = useState<DraftSize | null>(null)
  const [isResizing, setIsResizing] = useState(false)

  const rafRef = useRef<number | null>(null)
  const latestDraftRef = useRef<DraftSize | null>(null)
  const teardownResizeListenersRef = useRef<(() => void) | null>(null)
  const cursorRestoreRef = useRef<{ value: string, priority: string } | null>(null)
  const resizeRef = useRef<{
    pointerId: number
    mode: ResizeMode
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    maxWidth: number
  } | null>(null)

  const setBodyCursor = useCallback((cursor: string) => {
    if (cursorRestoreRef.current == null) {
      cursorRestoreRef.current = {
        value: document.body.style.getPropertyValue('cursor'),
        priority: document.body.style.getPropertyPriority('cursor'),
      }
    }
    document.body.style.setProperty('cursor', cursor, 'important')
  }, [])

  const restoreBodyCursor = useCallback(() => {
    if (cursorRestoreRef.current == null)
      return
    const { value, priority } = cursorRestoreRef.current
    if (value)
      document.body.style.setProperty('cursor', value, priority)
    else
      document.body.style.removeProperty('cursor')
    cursorRestoreRef.current = null
  }, [])

  const clearDraft = useCallback(() => {
    latestDraftRef.current = null
    setDraftSize(null)
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const scheduleDraftSize = useCallback((next: DraftSize) => {
    latestDraftRef.current = next
    if (rafRef.current != null)
      return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (latestDraftRef.current)
        setDraftSize(latestDraftRef.current)
    })
  }, [])

  useEffect(() => {
    return () => {
      teardownResizeListenersRef.current?.()
      teardownResizeListenersRef.current = null
      restoreBodyCursor()
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [restoreBodyCursor])

  const handleResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>, mode: ResizeMode) => {
    e.preventDefault()
    e.stopPropagation()

    const rect = imgRef.current?.getBoundingClientRect()
    const startWidth = rect?.width ?? element.width ?? fallbackSizeRef.current?.width ?? 0
    const startHeight = rect?.height ?? element.height ?? fallbackSizeRef.current?.height ?? 0
    if (!startWidth || !startHeight)
      return

    const maxWidth = getEditorMaxWidthPx(e.currentTarget) ?? startWidth

    resizeRef.current = {
      pointerId: e.pointerId,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startWidth,
      startHeight,
      maxWidth,
    }

    setIsResizing(true)
    setDraftSize({ width: Math.round(startWidth), height: Math.round(startHeight) })
    latestDraftRef.current = { width: Math.round(startWidth), height: Math.round(startHeight) }

    setBodyCursor(getCursorForMode(mode))

    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    catch {
      // ignore
    }

    teardownResizeListenersRef.current?.()
    teardownResizeListenersRef.current = null

    const handleWindowPointerMove = (ev: PointerEvent) => {
      const state = resizeRef.current
      if (!state || state.pointerId !== ev.pointerId)
        return

      ev.preventDefault()

      const deltaX = ev.clientX - state.startX
      const deltaY = ev.clientY - state.startY

      if (state.mode === 'proportional') {
        const scaleX = (state.startWidth + deltaX) / state.startWidth
        const scaleY = (state.startHeight + deltaY) / state.startHeight

        let scale = 1
        if (deltaX >= 0 && deltaY >= 0)
          scale = Math.max(scaleX, scaleY)
        else if (deltaX <= 0 && deltaY <= 0)
          scale = Math.min(scaleX, scaleY)
        else
          scale = Math.abs(deltaX) > Math.abs(deltaY) ? scaleX : scaleY

        const rawWidth = state.startWidth * scale
        const nextWidth = Math.max(MIN_IMAGE_WIDTH_PX, Math.min(state.maxWidth, rawWidth))
        const clampedScale = nextWidth / state.startWidth
        const nextHeight = Math.max(MIN_IMAGE_HEIGHT_PX, Math.round(state.startHeight * clampedScale))

        scheduleDraftSize({ width: Math.round(nextWidth), height: nextHeight })
        return
      }

      if (state.mode === 'width-only') {
        const nextWidth = Math.max(MIN_IMAGE_WIDTH_PX, Math.min(state.maxWidth, state.startWidth + deltaX))
        scheduleDraftSize({ width: Math.round(nextWidth), height: Math.round(state.startHeight) })
        return
      }

      const nextHeight = Math.max(MIN_IMAGE_HEIGHT_PX, Math.round(state.startHeight + deltaY))
      scheduleDraftSize({ width: Math.round(state.startWidth), height: nextHeight })
    }

    const finishResizeByPointerEvent = (ev: PointerEvent) => {
      const state = resizeRef.current
      if (!state || state.pointerId !== ev.pointerId)
        return

      resizeRef.current = null
      setIsResizing(false)

      const finalSize = latestDraftRef.current
      if (finalSize) {
        const path = ReactEditor.findPath(editor, element)
        Transforms.setNodes(editor, { width: finalSize.width, height: finalSize.height }, { at: path })
        fallbackSizeRef.current = { width: finalSize.width, height: finalSize.height }
      }
      ReactEditor.focus(editor)

      clearDraft()
      restoreBodyCursor()

      teardownResizeListenersRef.current?.()
      teardownResizeListenersRef.current = null
    }

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false })
    window.addEventListener('pointerup', finishResizeByPointerEvent)
    window.addEventListener('pointercancel', finishResizeByPointerEvent)

    teardownResizeListenersRef.current = () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', finishResizeByPointerEvent)
      window.removeEventListener('pointercancel', finishResizeByPointerEvent)
    }
  }, [clearDraft, editor, element, fallbackSizeRef, imgRef, restoreBodyCursor, scheduleDraftSize, setBodyCursor])

  return {
    draftSize,
    isResizing,
    clearDraft,
    handleResizePointerDown,
  }
}
