import type { NodeViewProps } from '@tiptap/react'
import type { KatexOptions } from 'katex'
import { Popover, PopoverAnchor, PopoverContent } from '@memorilo/components/ui/popover'
import { cn } from '@memorilo/utils'
import { NodeViewWrapper } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import katex from 'katex'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './math.module.css'

type MathVariant = 'inline' | 'block'
type RenderResult = { html: string; error: boolean }
type MathEditorElement = HTMLInputElement | HTMLTextAreaElement

interface InlineEditorProps {
  adornment: string
  value: string
  widthCh: number
  inputRef: React.RefObject<HTMLInputElement>
  onChange: (event: React.ChangeEvent<MathEditorElement>) => void
  onKeyDown: (event: React.KeyboardEvent<MathEditorElement>) => void
}

interface BlockEditorProps {
  adornment: string
  value: string
  inputRef: React.RefObject<HTMLTextAreaElement>
  onChange: (event: React.ChangeEvent<MathEditorElement>) => void
  onKeyDown: (event: React.KeyboardEvent<MathEditorElement>) => void
}

interface MathPreviewProps {
  html: string
  hasError: boolean
}

interface MathNodeViewProps extends NodeViewProps {
  variant: MathVariant
}

const inlineWidthBuffer = 1

function renderKatexHtml(latex: string, options: KatexOptions, displayMode: boolean): RenderResult {
  try {
    const html = katex.renderToString(latex, {
      ...options,
      displayMode,
      throwOnError: false,
    })
    return { html, error: false }
  } catch {
    return { html: latex, error: true }
  }
}

function getInlineInputWidth(value: string) {
  return Math.max(value.length, 1) + inlineWidthBuffer
}

function InlineEditor({
  adornment,
  value,
  widthCh,
  inputRef,
  onChange,
  onKeyDown,
}: InlineEditorProps) {
  return (
    <span className="inline-flex items-center gap-0">
      <span className="select-none font-mono text-blue-500">{adornment}</span>
      <input
        ref={inputRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        className="min-w-0 bg-transparent px-0.5 font-mono text-sm outline-none"
        style={{ width: `${widthCh}ch` }}
      />
      <span className="select-none font-mono text-blue-500">{adornment}</span>
    </span>
  )
}

function BlockEditor({
  adornment,
  value,
  inputRef,
  onChange,
  onKeyDown,
}: BlockEditorProps) {
  return (
    <div className={cn(styles.blockEditor, 'flex items-stretch gap-1')}>
      <span className={cn(styles.blockAdornment, styles.blockAdornmentStart, 'select-none font-mono text-blue-500')}>
        {adornment}
      </span>
      <textarea
        ref={inputRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        rows={1}
        className="w-full resize-none bg-transparent p-2 font-mono text-sm outline-none"
      />
      <span className={cn(styles.blockAdornment, styles.blockAdornmentEnd, 'select-none font-mono text-blue-500')}>
        {adornment}
      </span>
    </div>
  )
}

function MathPreview({ html, hasError }: MathPreviewProps) {
  return (
    <span
      className={cn(hasError && styles.mathError)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function MathNodeView({ node, editor, getPos, selected, extension, variant }: MathNodeViewProps) {
  const nodeLatex = node?.attrs?.latex ?? ''
  const nodeSize = node?.nodeSize ?? 0
  const [value, setValue] = useState<string>(nodeLatex)
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
      setValue(nextValue)
    } else if (wasSelectedRef.current) {
      if (skipCommitRef.current) {
        skipCommitRef.current = false
      } else {
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
    setValue(nextValue)
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

  const katexOptions = extension.options.katexOptions ?? {}
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
    setValue(event.target.value)
  }, [])

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
          {selected
            ? (
                isBlock
                  ? (
                      <BlockEditor
                        adornment={adornment}
                        value={value}
                        inputRef={inputRef as React.RefObject<HTMLTextAreaElement>}
                        onChange={handleValueChange}
                        onKeyDown={handleKeyDown}
                      />
                    )
                  : (
                      <InlineEditor
                        adornment={adornment}
                        value={value}
                        widthCh={inlineWidth}
                        inputRef={inputRef as React.RefObject<HTMLInputElement>}
                        onChange={handleValueChange}
                        onKeyDown={handleKeyDown}
                      />
                    )
              )
            : (
                <MathPreview html={renderResult.html} hasError={renderResult.error} />
              )}
        </NodeViewWrapper>
      </PopoverAnchor>
      <PopoverContent side="top" align="center" className="min-w-[200px] text-[11px]">
        <div className="mt-2 flex justify-center">
          <div
            className={cn(styles.popoverPreview, popoverResult.error && styles.mathError)}
            dangerouslySetInnerHTML={{ __html: popoverResult.html }}
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
