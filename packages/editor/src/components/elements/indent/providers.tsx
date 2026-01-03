import type { Element as SlateElement } from 'slate'
import type { IndentDragContextValueType, IndentDragOverState } from './contexts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Path } from 'slate'
import { useSlateStatic } from 'slate-react'
import { IndentDragContext, IndentEnableContext, IndentHoverContext } from './contexts'
import { getDropPosition, moveIndentSubtree, pickIndentTargetFromPoint } from './dnd'

export function RootIndentEnableContext(props: { children: React.ReactNode, enable: boolean }) {
  return (
    <IndentEnableContext value={props.enable}>
      {props.children}
    </IndentEnableContext>
  )
}

export function IndentDragProvider(props: { children: React.ReactNode }) {
  const editor = useSlateStatic()
  const [dragging, setDragging] = useState<IndentDragContextValueType['dragging']>(null)
  const [over, setOver] = useState<IndentDragOverState | null>(null)
  const [hoveredPath, setHoveredPathState] = useState<string | null>(null)
  const draggingRef = useRef(dragging)
  const overRef = useRef(over)
  const restoreRef = useRef<{ cursor: string, userSelect: string }>({ cursor: '', userSelect: '' })

  useEffect(() => {
    draggingRef.current = dragging
  }, [dragging])
  useEffect(() => {
    overRef.current = over
  }, [over])
  const endDrag = useCallback(() => {
    const restore = restoreRef.current
    if (restore.userSelect)
      document.body.style.userSelect = restore.userSelect
    else
      document.body.style.removeProperty('user-select')
    if (restore.cursor)
      document.body.style.cursor = restore.cursor
    else
      document.body.style.removeProperty('cursor')

    setDragging(null)
    setOver(null)
  }, [])

  const setHoveredPath = useCallback((nextPath: string | null) => {
    setHoveredPathState(prev => (prev === nextPath ? prev : nextPath))
  }, [])

  const startDrag = useCallback((path: Path, element: SlateElement, pointerId: number) => {
    restoreRef.current = { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    setDragging({ path, element, pointerId })
    setOver(null)
  }, [])

  useEffect(() => {
    if (!dragging)
      return

    const onMove = (event: PointerEvent) => {
      const active = draggingRef.current
      if (!active || event.pointerId !== active.pointerId)
        return

      const picked = pickIndentTargetFromPoint(editor, event.clientX, event.clientY)
      if (!picked) {
        setOver(null)
        return
      }

      const { indentNode, indentPath, containerRect, anchorRect } = picked
      if (Path.isAncestor(active.path, indentPath) || Path.equals(active.path, indentPath)) {
        setOver(null)
        return
      }

      const position = getDropPosition(event.clientX, event.clientY, containerRect, anchorRect)
      setOver({ targetPath: indentPath, targetElement: indentNode, position })
    }

    const onEnd = (event: PointerEvent) => {
      const active = draggingRef.current
      if (!active || event.pointerId !== active.pointerId)
        return

      const currentOver = overRef.current
      if (currentOver) {
        moveIndentSubtree(editor, active.path, currentOver.targetPath, currentOver.position)
      }
      endDrag()
    }

    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onEnd, true)
    window.addEventListener('pointercancel', onEnd, true)
    return () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onEnd, true)
      window.removeEventListener('pointercancel', onEnd, true)
    }
  }, [dragging, editor, endDrag])

  const value = useMemo<IndentDragContextValueType>(() => ({
    isDragging: !!dragging,
    dragging,
    over,
    endDrag,
    startDrag,
  }), [dragging, endDrag, over, startDrag])

  const hoverValue = useMemo(() => ({
    hoveredPath,
    setHoveredPath,
  }), [hoveredPath, setHoveredPath])

  return (
    <IndentHoverContext value={hoverValue}>
      <IndentDragContext value={value}>
        {props.children}
      </IndentDragContext>
    </IndentHoverContext>
  )
}
