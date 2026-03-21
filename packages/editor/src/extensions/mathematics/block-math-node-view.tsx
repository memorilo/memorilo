import type { ReactNodeViewProps } from '@tiptap/react'
import type { KatexOptions } from 'katex'
import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { cn } from '@memorilo/utils'
import { TextSelection } from '@tiptap/pm/state'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import katex from 'katex'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const previewErrorClasses = ['font-mono', 'text-red-600']

interface BlockMathNodeViewProps extends ReactNodeViewProps {
  katexOptions?: KatexOptions
}

function BlockMathNodeView({ node, editor, getPos, katexOptions: rawKatexOptions }: BlockMathNodeViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const selectionSyncFrameRef = useRef<number | null>(null)
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
      return
    }

    const { from, to } = editor.state.selection
    const isSelectionInsideContent = from >= bounds.contentStart && to <= bounds.contentEnd

    if (isSelectionInsideContent) {
      if (!isEditingActive) {
        setIsEditing(true)
      }
      return
    }

    exitEditing()
  }, [editor, exitEditing, isEditingActive, resolveContentBounds])

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
    editor.on('selectionUpdate', scheduleSelectionSync)
    editor.on('blur', scheduleSelectionSync)

    return () => {
      editor.off('selectionUpdate', scheduleSelectionSync)
      editor.off('blur', scheduleSelectionSync)
    }
  }, [editor, scheduleSelectionSync])

  useEffect(() => {
    return () => {
      if (selectionSyncFrameRef.current !== null) {
        cancelAnimationFrame(selectionSyncFrameRef.current)
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
        displayMode: true,
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
      as="div"
      ref={wrapperRef as RefObject<HTMLDivElement>}
      className={cn(
        'relative block w-full max-w-full rounded-xl px-3 py-2',
        !showRendered && 'border border-dashed border-input bg-transparent',
      )}
      data-type="block-math"
      data-math-variant="block"
      draggable={showRendered}
      onBlurCapture={scheduleSelectionSync}
      onFocusCapture={scheduleSelectionSync}
      onMouseDown={(event: ReactMouseEvent) => {
        if (!showRendered) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        enterEditing('end')
      }}
    >
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
      <div
        ref={previewRef as RefObject<HTMLDivElement>}
        className="block max-w-full overflow-x-auto [&_.katex-display]:m-0"
        contentEditable={false}
        hidden={!showRendered}
      />
    </NodeViewWrapper>
  )
}

export function createBlockMathNodeView(katexOptions?: KatexOptions) {
  return ReactNodeViewRenderer(
    props => <BlockMathNodeView {...props} katexOptions={katexOptions} />,
  )
}
