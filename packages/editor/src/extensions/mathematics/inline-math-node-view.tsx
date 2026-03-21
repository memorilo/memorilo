import type { ReactNodeViewProps } from '@tiptap/react'
import type { KatexOptions } from 'katex'
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { cn } from '@memorilo/utils'
import { TextSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import katex from 'katex'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const previewErrorClasses = ['font-mono', 'text-red-600']
const inlineBoundaryChar = '\uFEFF'
type CaretSide = 'before' | 'after'

interface InlineMathNodeViewProps extends ReactNodeViewProps {
  katexOptions?: KatexOptions
}

function InlineMathNodeView({ node, editor, getPos, katexOptions: rawKatexOptions }: InlineMathNodeViewProps) {
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const previewRef = useRef<HTMLSpanElement>(null)
  const selectionSyncFrameRef = useRef<number | null>(null)
  const selectionRestoreFrameRef = useRef<number | null>(null)
  const latex = node.textContent
  const isFormulaEmpty = !latex.trim()
  const [isEditing, setIsEditing] = useState(() => isFormulaEmpty)
  const isEditingActive = isEditing || isFormulaEmpty
  const showRendered = !isFormulaEmpty && !isEditingActive
  const katexOptions = useMemo(() => rawKatexOptions ?? {}, [rawKatexOptions])

  const resolvePos = useCallback(() => {
    const pos = typeof getPos === 'function' ? getPos() : getPos
    return typeof pos === 'number' ? pos : null
  }, [getPos])

  const resolveContentBounds = useCallback(() => {
    const pos = resolvePos()
    if (pos === null) {
      return null
    }

    return {
      pos,
      contentStart: pos + 1,
      contentEnd: pos + node.nodeSize - 1,
    }
  }, [node.nodeSize, resolvePos])

  const isDomSelectionInsideContent = useCallback(() => {
    const contentElement = wrapperRef.current?.querySelector('[data-node-view-content]') as HTMLElement | null
    if (!contentElement) {
      return false
    }

    const selection = 'getSelection' in editor.view.root
      ? editor.view.root.getSelection()
      : document.getSelection()
    if (!selection || selection.rangeCount === 0 || !selection.anchorNode || !selection.focusNode) {
      return false
    }

    const anchorInside = selection.anchorNode === contentElement || contentElement.contains(selection.anchorNode)
    const focusInside = selection.focusNode === contentElement || contentElement.contains(selection.focusNode)

    return anchorInside && focusInside
  }, [editor.view.root])

  const restoreDomSelectionAtPos = useCallback((selectionPos: number, side: CaretSide) => {
    if (selectionRestoreFrameRef.current !== null) {
      cancelAnimationFrame(selectionRestoreFrameRef.current)
    }

    selectionRestoreFrameRef.current = requestAnimationFrame(() => {
      selectionRestoreFrameRef.current = null

      if (!editor.view.hasFocus()) {
        return
      }

      const rootSelection = 'getSelection' in editor.view.root
        ? editor.view.root.getSelection()
        : document.getSelection()
      if (!rootSelection) {
        return
      }

      // Exiting edit mode rerenders the node view, so the browser caret
      // may need to be re-anchored against the new DOM structure.
      const { node: domNode, offset } = editor.view.domAtPos(selectionPos, side === 'before' ? -1 : 1)
      const range = editor.view.dom.ownerDocument.createRange()
      range.setStart(domNode, offset)
      range.collapse(true)
      rootSelection.removeAllRanges()
      rootSelection.addRange(range)
    })
  }, [editor.view])

  const placeCaretOutside = useCallback((side: CaretSide) => {
    const pos = resolvePos()
    if (pos === null) {
      return
    }

    const selectionPos = side === 'before' ? pos : pos + node.nodeSize
    editor.commands.command(({ tr, dispatch }) => {
      tr.setSelection(TextSelection.create(tr.doc, selectionPos))
      if (dispatch) {
        dispatch(tr)
      }
      editor.view.focus()
      return true
    })
  }, [editor.commands, editor.view, node.nodeSize, resolvePos])

  const enterEditing = useCallback((selectionPos?: number | 'start' | 'end') => {
    const bounds = resolveContentBounds()
    if (!bounds) {
      return
    }

    const { contentStart, contentEnd } = bounds
    setIsEditing(true)
    editor.commands.command(({ tr }) => {
      const { from, to } = tr.selection
      const shouldPreserveSelection = selectionPos === undefined && from >= contentStart && to <= contentEnd
      const nextFrom = shouldPreserveSelection
        ? Math.max(contentStart, Math.min(from, contentEnd))
        : selectionPos === 'start'
          ? contentStart
          : selectionPos === 'end'
            ? contentEnd
            : typeof selectionPos === 'number'
              ? Math.max(contentStart, Math.min(selectionPos, contentEnd))
              : null
      const nextTo = shouldPreserveSelection
        ? Math.max(contentStart, Math.min(to, contentEnd))
        : nextFrom

      if (nextFrom !== null && nextTo !== null) {
        tr.setSelection(TextSelection.create(tr.doc, nextFrom, nextTo))
      }

      return true
    })
  }, [editor.commands, resolveContentBounds])

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

    const { from, to } = editor.state.selection
    const nextSelection = to <= pos
      ? { pos, side: 'before' as const }
      : from >= pos + node.nodeSize
        ? { pos: pos + node.nodeSize, side: 'after' as const }
        : null

    setIsEditing(false)
    if (nextSelection) {
      restoreDomSelectionAtPos(nextSelection.pos, nextSelection.side)
    }
  }, [editor.commands, editor.state.selection, isEditingActive, latex, node.nodeSize, resolveContentBounds, restoreDomSelectionAtPos])

  const syncSelectionState = useCallback(() => {
    const bounds = resolveContentBounds()
    if (!bounds) {
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
  }, [editor, exitEditing, isDomSelectionInsideContent, isEditingActive, isFormulaEmpty, node.nodeSize, resolveContentBounds])

  const scheduleSelectionSync = useCallback(() => {
    if (selectionSyncFrameRef.current !== null) {
      cancelAnimationFrame(selectionSyncFrameRef.current)
    }

    selectionSyncFrameRef.current = requestAnimationFrame(() => {
      selectionSyncFrameRef.current = null
      syncSelectionState()
    })
  }, [syncSelectionState])

  useEffect(() => {
    const ownerDocument = editor.view.dom.ownerDocument

    editor.on('selectionUpdate', scheduleSelectionSync)
    editor.on('blur', scheduleSelectionSync)
    ownerDocument.addEventListener('selectionchange', scheduleSelectionSync)

    return () => {
      editor.off('selectionUpdate', scheduleSelectionSync)
      editor.off('blur', scheduleSelectionSync)
      ownerDocument.removeEventListener('selectionchange', scheduleSelectionSync)
    }
  }, [editor, scheduleSelectionSync])

  useEffect(() => {
    return () => {
      if (selectionSyncFrameRef.current !== null) {
        cancelAnimationFrame(selectionSyncFrameRef.current)
      }
      if (selectionRestoreFrameRef.current !== null) {
        cancelAnimationFrame(selectionRestoreFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    scheduleSelectionSync()
  }, [scheduleSelectionSync])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview || !showRendered) {
      return
    }

    try {
      katex.render(latex, preview, {
        ...katexOptions,
        displayMode: false,
        throwOnError: false,
      })
      preview.classList.remove(...previewErrorClasses)
    }
    catch {
      preview.textContent = latex
      preview.classList.add(...previewErrorClasses)
    }
  }, [katexOptions, latex, showRendered])

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapperRef as RefObject<HTMLSpanElement>}
      className={cn(
        'relative inline-block max-w-full align-middle',
        !showRendered && 'rounded-md border border-dashed border-input bg-transparent px-1.5 py-0.5',
      )}
      data-type="inline-math"
      data-math-variant="inline"
      draggable={showRendered}
      onBlurCapture={scheduleSelectionSync}
      onFocusCapture={scheduleSelectionSync}
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

        enterEditing('end')
      }}
    >
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
      <span
        ref={previewRef as RefObject<HTMLSpanElement>}
        className="inline-block max-w-full align-baseline"
        contentEditable={false}
        hidden={!showRendered}
      />
    </NodeViewWrapper>
  )
}

export function createInlineMathNodeView(katexOptions?: KatexOptions) {
  return ReactNodeViewRenderer(
    props => <InlineMathNodeView {...props} katexOptions={katexOptions} />,
  )
}
