import type { NodeViewProps } from '@tiptap/react'
import type { MathEditorElement, MathVariant } from './math-node-view-components'
import { Popover, PopoverAnchor, PopoverContent } from '@memorilo/components/ui/popover'
import { cn } from '@memorilo/utils'
import { TextSelection } from '@tiptap/pm/state'
import { NodeViewWrapper } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import {
  BlockEditor,
  getInlineInputWidth,
  InlineEditor,
  MathPreview,
  renderKatexHtml,
} from './math-node-view-components'
import styles from './math.module.css'

interface MathNodeViewProps extends NodeViewProps {
  variant: MathVariant
}

function MathNodeView({ node, editor, getPos, selected, extension, variant }: MathNodeViewProps) {
  const nodeLatex = node?.attrs?.latex ?? ''
  const nodeSize = node?.nodeSize ?? 0
  const [value, dispatchValue] = useReducer((_: string, next: string) => next, nodeLatex)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const initialValueRef = useRef<string>(nodeLatex)
  const valueRef = useRef<string>(nodeLatex)
  const wasSelectedRef = useRef<boolean>(selected)
  const skipCommitRef = useRef<boolean>(false)
  const isBlock = variant === 'block'

  const resolvePos = useCallback(() => {
    const pos = typeof getPos === 'function' ? getPos() : getPos
    return typeof pos === 'number' ? pos : null
  }, [getPos])

  const resizeTextarea = useCallback(() => {
    // Native textarea does not auto-grow; sync height to content.
    const el = inputRef.current
    if (!(el instanceof HTMLTextAreaElement)) {
      return
    }
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const commitValue = useCallback((nextValue: string) => {
    const pos = resolvePos()
    if (pos === null || !node) {
      return
    }

    if (nextValue === nodeLatex) {
      return
    }

    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, latex: nextValue })
      return true
    })
  }, [editor, node, nodeLatex, resolvePos])

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    // Keep the edit buffer in sync with the selected node and commit on blur.
    if (selected) {
      const nextValue = nodeLatex
      initialValueRef.current = nextValue
      valueRef.current = nextValue
      dispatchValue(nextValue)
    }
    else if (wasSelectedRef.current) {
      if (skipCommitRef.current) {
        skipCommitRef.current = false
      }
      else {
        commitValue(valueRef.current)
      }
    }

    wasSelectedRef.current = selected
  }, [commitValue, nodeLatex, selected])

  useEffect(() => {
    if (!selected) {
      return
    }

    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
      resizeTextarea()
    })
  }, [resizeTextarea, selected])

  useEffect(() => {
    if (selected && isBlock) {
      resizeTextarea()
    }
  }, [isBlock, resizeTextarea, selected, value])

  const moveSelectionAfter = useCallback(() => {
    const pos = resolvePos()
    if (pos === null) {
      return
    }

    if (nodeSize === 0) {
      return
    }
    editor.commands.setTextSelection(pos + nodeSize)
  }, [editor, nodeSize, resolvePos])

  const deleteNodeAtSelection = useCallback(() => {
    const pos = resolvePos()
    if (pos === null || nodeSize === 0) {
      return
    }

    editor.commands.command(({ tr }) => {
      tr.delete(pos, pos + nodeSize)
      const nextPos = Math.min(pos, tr.doc.content.size)
      tr.setSelection(TextSelection.create(tr.doc, nextPos))
      return true
    })
  }, [editor, nodeSize, resolvePos])

  const commitAndExit = useCallback(() => {
    skipCommitRef.current = true
    commitValue(valueRef.current)
    moveSelectionAfter()
  }, [commitValue, moveSelectionAfter])

  const cancelEditing = useCallback(() => {
    const nextValue = initialValueRef.current
    valueRef.current = nextValue
    dispatchValue(nextValue)
    skipCommitRef.current = true
    moveSelectionAfter()
  }, [moveSelectionAfter])

  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (selected) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const pos = resolvePos()
    if (pos === null) {
      return
    }

    editor.commands.setNodeSelection(pos)
  }, [editor, resolvePos, selected])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<MathEditorElement>) => {
    if (event.key === 'Backspace') {
      // Delete the whole math node when backspacing at the start of the editor.
      const target = event.currentTarget as MathEditorElement
      const selectionStart = target?.selectionStart ?? 0
      const selectionEnd = target?.selectionEnd ?? 0
      if (selectionStart === 0 && selectionEnd === 0) {
        event.preventDefault()
        deleteNodeAtSelection()
        return
      }
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
      return
    }

    if (variant === 'inline' && event.key === 'Enter') {
      event.preventDefault()
      commitAndExit()
      return
    }

    if (variant === 'block' && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      commitAndExit()
    }
  }, [cancelEditing, commitAndExit, deleteNodeAtSelection, variant])

  const katexOptions = useMemo(
    () => extension.options.katexOptions ?? {},
    [extension.options.katexOptions],
  )
  const latexToRender = nodeLatex
  const renderResult = useMemo(
    () => renderKatexHtml(latexToRender, katexOptions, isBlock),
    [isBlock, katexOptions, latexToRender],
  )
  const previewLatex = selected ? value : latexToRender
  const popoverResult = useMemo(
    () => renderKatexHtml(previewLatex, katexOptions, isBlock),
    [isBlock, katexOptions, previewLatex],
  )

  const hint = isBlock ? 'Ctrl+Enter 保存 · Esc 取消' : 'Enter 保存 · Esc 取消'
  const showPopover = selected
  const adornment = isBlock ? '$$' : '$'
  const inlineWidth = getInlineInputWidth(value)
  const handleValueChange = useCallback((event: React.ChangeEvent<MathEditorElement>) => {
    dispatchValue(event.target.value)
  }, [])

  let content = <MathPreview html={renderResult.html} hasError={renderResult.error} />
  if (selected) {
    if (isBlock) {
      content = (
        <BlockEditor
          adornment={adornment}
          value={value}
          inputRef={inputRef as React.RefObject<HTMLTextAreaElement>}
          onChange={handleValueChange}
          onKeyDown={handleKeyDown}
        />
      )
    }
    else {
      content = (
        <InlineEditor
          adornment={adornment}
          value={value}
          widthCh={inlineWidth}
          inputRef={inputRef as React.RefObject<HTMLInputElement>}
          onChange={handleValueChange}
          onKeyDown={handleKeyDown}
        />
      )
    }
  }

  return (
    <Popover open={showPopover}>
      <PopoverAnchor asChild>
        <NodeViewWrapper
          as={isBlock ? 'div' : 'span'}
          className={cn(
            styles.math,
            !selected && (isBlock ? 'block w-full rounded-md py-2' : 'inline-flex items-center align-middle'),
          )}
          contentEditable={false}
          data-math-variant={variant}
          onMouseDown={handleMouseDown}
        >
          {content}
        </NodeViewWrapper>
      </PopoverAnchor>
      <PopoverContent side="top" align="center" className="min-w-[200px] text-[11px]">
        <div className="mt-2 flex justify-center">
          <MathPreview
            as="div"
            className={styles.popoverPreview}
            html={popoverResult.html}
            hasError={popoverResult.error}
          />
        </div>
        <div className="mt-1 select-none text-[9px] text-muted-foreground">
          {hint}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function InlineMathNodeView(props: NodeViewProps) {
  return <MathNodeView {...props} variant="inline" />
}

export function BlockMathNodeView(props: NodeViewProps) {
  return <MathNodeView {...props} variant="block" />
}
