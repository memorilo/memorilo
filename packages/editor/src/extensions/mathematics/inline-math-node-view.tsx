import type { ReactNodeViewProps } from '@tiptap/react'
import type { KatexOptions } from 'katex'
import type {
  MutableRefObject,
  MouseEvent as ReactMouseEvent,
  RefObject,
} from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@memorilo/components/ui/popover'
import { cn } from '@memorilo/utils'
import { TextSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { moveInlineMathCaretVertically } from './inline-math-navigation'
import { MathPreview } from './math-preview'

const inlineBoundaryChar = '\uFEFF'
type CaretSide = 'before' | 'after'
interface PendingTextSelection {
  from: number
  to: number
}

interface PendingDomRestore {
  pos: number
  side: CaretSide
}

interface InlineMathNodeViewProps extends ReactNodeViewProps {
  katexOptions?: KatexOptions
}

// Queues a text selection while the editable content is still hidden, then applies it
// in a layout effect once the node view is mounted and ready to paint the caret.
function usePendingSelectionRestore(
  editor: InlineMathNodeViewProps['editor'],
  wrapperRef: RefObject<HTMLSpanElement | null>,
  isEditingActive: boolean,
) {
  const pendingSelectionRef = useRef<PendingTextSelection | null>(null)

  const queuePendingSelection = useCallback((pendingSelection: PendingTextSelection | null) => {
    pendingSelectionRef.current = pendingSelection
  }, [])

  useLayoutEffect(() => {
    const pendingSelection = pendingSelectionRef.current
    if (!isEditingActive || !pendingSelection) {
      return
    }

    if (!wrapperRef.current?.querySelector<HTMLElement>('[data-node-view-content]')) {
      return
    }

    if (!editor.view.hasFocus()) {
      editor.view.focus()
    }

    const { from, to } = pendingSelection
    const currentSelection = editor.state.selection
    if (currentSelection.from !== from || currentSelection.to !== to) {
      // Run before paint so the first visible caret position already matches the editable formula DOM.
      editor.commands.command(({ tr, dispatch }) => {
        tr.setSelection(TextSelection.create(tr.doc, from, to))
        if (dispatch) {
          dispatch(tr)
        }
        return true
      })
    }

    pendingSelectionRef.current = null
  }, [editor, isEditingActive, wrapperRef])

  return queuePendingSelection
}

// Restores the browser DOM caret after leaving inline edit mode so the next key press
// lands before or after the formula instead of mutating the node view wrapper DOM.
function usePendingDomRestore(
  editor: InlineMathNodeViewProps['editor'],
  wrapperRef: RefObject<HTMLSpanElement | null>,
  isEditingActive: boolean,
) {
  const pendingDomRestoreRef = useRef<PendingDomRestore | null>(null)

  const queuePendingDomRestore = useCallback((pendingDomRestore: PendingDomRestore | null) => {
    pendingDomRestoreRef.current = pendingDomRestore
  }, [])

  useLayoutEffect(() => {
    const pendingDomRestore = pendingDomRestoreRef.current
    if (isEditingActive || !pendingDomRestore) {
      return
    }

    if (!editor.view.hasFocus()) {
      pendingDomRestoreRef.current = null
      return
    }

    const { pos, side } = pendingDomRestore
    const range = editor.view.dom.ownerDocument.createRange()
    const nodeViewRoot = wrapperRef.current?.parentElement

    const rootSelection = 'getSelection' in editor.view.root
      ? editor.view.root.getSelection()
      : document.getSelection()
    if (!rootSelection) {
      pendingDomRestoreRef.current = null
      return
    }

    // The document selection has already moved outside the formula. Re-anchor the browser caret to
    // the node-view boundary itself so subsequent typing lands before/after the formula instead of
    // mutating the node view wrapper DOM.
    if (nodeViewRoot?.isConnected && nodeViewRoot.parentNode) {
      if (side === 'before') {
        range.setStartBefore(nodeViewRoot)
      }
      else {
        range.setStartAfter(nodeViewRoot)
      }
    }
    else {
      const { node: domNode, offset } = editor.view.domAtPos(pos, side === 'before' ? -1 : 1)
      range.setStart(domNode, offset)
    }
    range.collapse(true)
    rootSelection.removeAllRanges()
    rootSelection.addRange(range)
    pendingDomRestoreRef.current = null
  }, [editor.view, isEditingActive, wrapperRef])

  return queuePendingDomRestore
}

// Keeps the React node view in sync with ProseMirror selection changes and pointer-driven
// selection updates, while throttling expensive checks behind requestAnimationFrame.
function useNodeViewSelectionSync(
  editor: InlineMathNodeViewProps['editor'],
  syncSelectionState: () => void,
  isPointerSelectionActiveRef: MutableRefObject<boolean>,
) {
  const selectionSyncFrameRef = useRef(0)

  const scheduleSelectionSync = useCallback(() => {
    if (selectionSyncFrameRef.current) {
      cancelAnimationFrame(selectionSyncFrameRef.current)
    }

    selectionSyncFrameRef.current = requestAnimationFrame(() => {
      selectionSyncFrameRef.current = 0
      syncSelectionState()
    })
  }, [syncSelectionState])

  const startPointerSelection = useCallback(() => {
    isPointerSelectionActiveRef.current = true
  }, [isPointerSelectionActiveRef])

  useEffect(() => {
    const finishPointerSelection = () => {
      if (!isPointerSelectionActiveRef.current) {
        return
      }

      isPointerSelectionActiveRef.current = false
      scheduleSelectionSync()
    }

    const ownerDocument = editor.view.dom.ownerDocument

    editor.on('selectionUpdate', scheduleSelectionSync)
    editor.on('blur', scheduleSelectionSync)
    ownerDocument.addEventListener('selectionchange', scheduleSelectionSync)
    ownerDocument.addEventListener('mouseup', finishPointerSelection)

    return () => {
      editor.off('selectionUpdate', scheduleSelectionSync)
      editor.off('blur', scheduleSelectionSync)
      ownerDocument.removeEventListener('selectionchange', scheduleSelectionSync)
      ownerDocument.removeEventListener('mouseup', finishPointerSelection)
    }
  }, [editor, isPointerSelectionActiveRef, scheduleSelectionSync])

  useEffect(() => {
    scheduleSelectionSync()
  }, [scheduleSelectionSync])

  useEffect(() => {
    return () => {
      if (selectionSyncFrameRef.current) {
        cancelAnimationFrame(selectionSyncFrameRef.current)
      }
    }
  }, [])

  return { scheduleSelectionSync, startPointerSelection }
}

export function InlineMathNodeView({ node, editor, getPos, katexOptions: rawKatexOptions }: InlineMathNodeViewProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const previewRef = useRef<HTMLElement | null>(null)
  const isPointerSelectionActiveRef = useRef(false)
  const latex = node.textContent
  const isFormulaEmpty = !latex.trim()
  const [isEditing, setIsEditing] = useState(() => isFormulaEmpty)
  const isEditingActive = isEditing || isFormulaEmpty
  const showRendered = !isFormulaEmpty && !isEditingActive
  const queuePendingSelection = usePendingSelectionRestore(editor, wrapperRef, isEditingActive)
  const queuePendingDomRestore = usePendingDomRestore(editor, wrapperRef, isEditingActive)

  const resolveContentBounds = useCallback(() => {
    const pos = getPos()
    if (pos === undefined) {
      return null
    }

    return {
      pos,
      contentStart: pos + 1,
      contentEnd: pos + node.nodeSize - 1,
    }
  }, [getPos, node.nodeSize])

  const isDomSelectionInsideContent = useCallback(() => {
    const contentElement = wrapperRef.current?.querySelector<HTMLElement>('[data-node-view-content]')
    if (!contentElement) {
      return false
    }

    const selection = 'getSelection' in editor.view.root
      ? editor.view.root.getSelection()
      : document.getSelection()
    const { anchorNode, focusNode } = selection ?? {}
    if (!anchorNode || !focusNode) {
      return false
    }

    return contentElement.contains(anchorNode) && contentElement.contains(focusNode)
  }, [editor.view.root])

  const placeCaretOutside = useCallback((side: CaretSide) => {
    const bounds = resolveContentBounds()
    if (!bounds) {
      return
    }

    const selectionPos = side === 'before' ? bounds.pos : bounds.pos + node.nodeSize
    editor.commands.command(({ tr, dispatch }) => {
      tr.setSelection(TextSelection.create(tr.doc, selectionPos))
      if (dispatch) {
        dispatch(tr)
      }
      editor.view.focus()
      return true
    })
  }, [editor.commands, editor.view, node.nodeSize, resolveContentBounds])

  const enterEditing = useCallback((moveCaretToEnd = false) => {
    const bounds = resolveContentBounds()
    if (!bounds) {
      return
    }

    const { from, to } = editor.state.selection
    const { contentStart, contentEnd } = bounds
    const shouldPreserveSelection = !moveCaretToEnd && from >= contentStart && to <= contentEnd
    let nextFrom: number | null = null
    if (shouldPreserveSelection) {
      nextFrom = Math.max(contentStart, Math.min(from, contentEnd))
    }
    else if (moveCaretToEnd) {
      nextFrom = contentEnd
    }

    if (nextFrom) {
      // Flip the node into editing mode first, then move the selection in a layout effect.
      // This avoids drawing the caret inside a content element that is still visually hidden.
      queuePendingSelection({
        from: nextFrom,
        to: shouldPreserveSelection ? Math.max(contentStart, Math.min(to, contentEnd)) : nextFrom,
      })
    }
    else {
      queuePendingSelection(null)
    }
    setIsEditing(true)
  }, [editor.state.selection, queuePendingSelection, resolveContentBounds])

  const exitEditing = useCallback(() => {
    const bounds = resolveContentBounds()
    if (!bounds || !isEditingActive) {
      return
    }

    const { pos } = bounds
    if (!latex.trim()) {
      editor.commands.command(({ tr }) => {
        tr.delete(pos, pos + node.nodeSize)
        return true
      })
      return
    }

    const { selection } = editor.state
    let nextSelection: PendingDomRestore | null = null
    if (selection.empty) {
      nextSelection = {
        pos: selection.head,
        side: selection.head <= pos ? 'before' : 'after',
      }
    }

    setIsEditing(false)
    if (nextSelection) {
      queuePendingDomRestore(nextSelection)
    }
  }, [editor.commands, editor.state, isEditingActive, latex, node.nodeSize, queuePendingDomRestore, resolveContentBounds])

  const syncSelectionState = useCallback(() => {
    const bounds = resolveContentBounds()
    if (!bounds) {
      isPointerSelectionActiveRef.current = false
      setIsEditing(false)
      return
    }

    const { from, to } = editor.state.selection
    const isDomSelectionInside = isDomSelectionInsideContent()
    const isSelectionAdjacentToNode = from === to && (from === bounds.pos || from === bounds.pos + node.nodeSize)
    const isSelectionInsideContent = from >= bounds.contentStart && to <= bounds.contentEnd

    if (isFormulaEmpty && isEditingActive && isDomSelectionInside && isSelectionAdjacentToNode) {
      editor.commands.command(({ tr, dispatch }) => {
        tr.setSelection(TextSelection.create(tr.doc, bounds.contentStart))
        if (dispatch) {
          dispatch(tr)
        }
        return true
      })
      return
    }

    if (isPointerSelectionActiveRef.current) {
      return
    }

    if (isSelectionInsideContent) {
      if (!isEditingActive) {
        setIsEditing(true)
      }
      return
    }

    if (isSelectionAdjacentToNode) {
      exitEditing()
      return
    }

    if (isDomSelectionInside) {
      return
    }

    exitEditing()
  }, [editor, exitEditing, isDomSelectionInsideContent, isEditingActive, isFormulaEmpty, node.nodeSize, resolveContentBounds])

  const { scheduleSelectionSync, startPointerSelection } = useNodeViewSelectionSync(
    editor,
    syncSelectionState,
    isPointerSelectionActiveRef,
  )

  useEffect(() => {
    const ownerDocument = editor.view.dom.ownerDocument

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return
      }

      const bounds = resolveContentBounds()
      if (!bounds) {
        return
      }

      const { from, to, empty } = editor.state.selection
      if (!empty || from < bounds.contentStart || to > bounds.contentEnd) {
        return
      }

      const handled = editor.commands.command(({ state, tr, dispatch, view }) =>
        moveInlineMathCaretVertically(
          state,
          tr,
          dispatch,
          view,
          node.type.name,
          event.key === 'ArrowUp' ? -1 : 1,
        ))

      if (!handled) {
        return
      }

      setIsEditing(false)
      event.preventDefault()
      event.stopPropagation()
    }

    ownerDocument.addEventListener('keydown', handleKeyDown, true)
    return () => {
      ownerDocument.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [editor, node.type.name, resolveContentBounds])

  const isNodeAttached = !!resolveContentBounds()

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapperRef}
      className={cn(
        'relative inline-block max-w-full align-middle',
        !showRendered && 'rounded-md border border-dashed border-input bg-transparent px-1.5 py-0.5',
      )}
      data-type="inline-math"
      data-math-variant="inline"
      draggable={showRendered}
      onBlurCapture={scheduleSelectionSync}
      onFocusCapture={scheduleSelectionSync}
      onMouseDownCapture={() => {
        if (isEditingActive) {
          startPointerSelection()
        }
      }}
      onMouseDown={(event: ReactMouseEvent) => {
        if (!showRendered) {
          return
        }

        event.preventDefault()
        event.stopPropagation()

        const previewRect = previewRef.current?.getBoundingClientRect()
        if (previewRect) {
          const trailingEdgeThreshold = Math.max(4, Math.min(12, previewRect.width * 0.15))
          if (previewRect.right - event.clientX <= trailingEdgeThreshold) {
            placeCaretOutside('after')
            return
          }
        }

        enterEditing(true)
      }}
    >
      <Popover open={isNodeAttached && isEditingActive}>
        <PopoverAnchor asChild>
          <span
            aria-hidden="true"
            contentEditable={false}
            className="pointer-events-none absolute inset-0 z-0"
          />
        </PopoverAnchor>
        <PopoverContent
          side="top"
          sideOffset={8}
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={event => event.preventDefault()}
          className="pointer-events-none w-fit max-w-[min(32rem,calc(100vw-2rem))] px-3 py-2 text-sm"
        >
          <MathPreview
            as="span"
            latex={latex}
            displayMode={false}
            katexOptions={rawKatexOptions}
            className="inline-block max-w-full align-baseline"
          />
        </PopoverContent>
      </Popover>
      <span
        aria-hidden="true"
        className="inline-block h-[1em] w-0 overflow-hidden align-baseline select-none"
        contentEditable={false}
        data-math-boundary="start"
      >
        {inlineBoundaryChar}
      </span>
      <NodeViewContent<'span'>
        as="span"
        className={cn(
          'inline-block min-w-[1ch] align-baseline whitespace-pre-wrap break-words font-mono outline-none',
          !latex.trim() && 'before:content-[\'\\00a0\']',
          showRendered && 'pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden opacity-0',
        )}
        spellCheck={false}
        data-gramm="false"
      />
      <span
        aria-hidden="true"
        className="inline-block h-[1em] w-0 overflow-hidden align-baseline select-none"
        contentEditable={false}
        data-math-boundary="end"
      >
        {inlineBoundaryChar}
      </span>
      {showRendered && (
        <MathPreview
          ref={previewRef}
          as="span"
          latex={latex}
          displayMode={false}
          katexOptions={rawKatexOptions}
          className="inline-block max-w-full align-baseline"
        />
      )}
    </NodeViewWrapper>
  )
}
