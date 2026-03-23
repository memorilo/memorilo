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
import { MathPreview } from './math-preview'

interface BlockMathNodeViewProps extends ReactNodeViewProps {
  katexOptions?: KatexOptions
}

interface PendingTextSelection {
  from: number
  to: number
}

// Queues a text selection while the editable block is hidden, then replays it in a
// layout effect once the block node view is visible and ready for caret placement.
function usePendingSelectionRestore(
  editor: BlockMathNodeViewProps['editor'],
  wrapperRef: RefObject<HTMLDivElement | null>,
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

    const { from, to } = pendingSelection
    const currentSelection = editor.state.selection
    if (currentSelection.from !== from || currentSelection.to !== to) {
      // Apply before paint so the caret appears in the final block position on the first frame.
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

// Keeps the block node view aligned with ProseMirror selection updates and defers the
// expensive synchronization work behind requestAnimationFrame during pointer activity.
function useNodeViewSelectionSync(
  editor: BlockMathNodeViewProps['editor'],
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

export function BlockMathNodeView({ node, editor, getPos, katexOptions: rawKatexOptions }: BlockMathNodeViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isPointerSelectionActiveRef = useRef(false)
  const latex = node.textContent
  const isFormulaEmpty = !latex.trim()
  const [isEditing, setIsEditing] = useState(() => isFormulaEmpty)
  const isEditingActive = isEditing || isFormulaEmpty
  const showRendered = !isFormulaEmpty && !isEditingActive
  const queuePendingSelection = usePendingSelectionRestore(editor, wrapperRef, isEditingActive)

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
      // Show the editable block first, then place the selection during layout.
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
    if (isFormulaEmpty) {
      editor.commands.command(({ state, tr, dispatch }) => {
        const paragraphType = state.schema.nodes.paragraph
        if (!paragraphType) {
          return false
        }

        const $pos = state.doc.resolve(pos)
        if (!$pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, paragraphType)) {
          return false
        }

        tr.replaceWith(pos, pos + node.nodeSize, paragraphType.create())
        tr.setSelection(TextSelection.create(tr.doc, pos + 1))
        if (dispatch) {
          dispatch(tr)
        }
        return true
      })
      return
    }

    setIsEditing(false)
  }, [editor.commands, isEditingActive, isFormulaEmpty, node.nodeSize, resolveContentBounds])

  const syncSelectionState = useCallback(() => {
    const bounds = resolveContentBounds()
    if (!bounds) {
      isPointerSelectionActiveRef.current = false
      setIsEditing(false)
      return
    }

    const { from, to } = editor.state.selection
    const isDomSelectionInside = isDomSelectionInsideContent()
    const isSelectionInsideContent = from >= bounds.contentStart && to <= bounds.contentEnd

    if (isPointerSelectionActiveRef.current) {
      return
    }

    if (isSelectionInsideContent) {
      if (!isEditingActive) {
        setIsEditing(true)
      }
      return
    }

    if (isDomSelectionInside) {
      return
    }

    exitEditing()
  }, [editor, exitEditing, isDomSelectionInsideContent, isEditingActive, resolveContentBounds])

  const { scheduleSelectionSync, startPointerSelection } = useNodeViewSelectionSync(
    editor,
    syncSelectionState,
    isPointerSelectionActiveRef,
  )

  const isNodeAttached = !!resolveContentBounds()

  return (
    <NodeViewWrapper
      as="div"
      ref={wrapperRef}
      className={cn(
        'relative block w-full max-w-full rounded-xl px-3 py-2',
        !showRendered && 'border border-dashed border-input bg-transparent',
      )}
      data-type="block-math"
      data-math-variant="block"
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
        enterEditing(true)
      }}
    >
      <Popover open={isNodeAttached && isEditingActive}>
        <PopoverAnchor asChild>
          <div
            aria-hidden="true"
            contentEditable={false}
            className="pointer-events-none absolute inset-0 z-0"
          />
        </PopoverAnchor>
        <PopoverContent
          side="top"
          sideOffset={10}
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={event => event.preventDefault()}
          className="pointer-events-none w-fit max-w-[min(42rem,calc(100vw-2rem))] px-3 py-2 text-sm"
        >
          <MathPreview
            as="div"
            latex={latex}
            displayMode={true}
            katexOptions={rawKatexOptions}
            className="block max-w-full overflow-x-auto [&_.katex-display]:m-0"
          />
        </PopoverContent>
      </Popover>
      <NodeViewContent
        as="div"
        className={cn(
          'block min-h-6 whitespace-pre-wrap break-words font-mono outline-none',
          !latex.trim() && 'before:content-[\'\\00a0\']',
          showRendered && 'pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0',
        )}
        spellCheck={false}
        data-gramm="false"
      />
      {showRendered && (
        <MathPreview
          as="div"
          latex={latex}
          displayMode={true}
          katexOptions={rawKatexOptions}
          className="block max-w-full overflow-x-auto [&_.katex-display]:m-0"
        />
      )}
    </NodeViewWrapper>
  )
}
