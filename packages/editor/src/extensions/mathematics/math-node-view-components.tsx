import type { KatexOptions } from 'katex'
import { cn } from '@memorilo/utils'
import katex from 'katex'
import styles from './math.module.css'

export type MathVariant = 'inline' | 'block'
export type RenderResult = { html: string; error: boolean }
export type MathEditorElement = HTMLInputElement | HTMLTextAreaElement

export interface InlineEditorProps {
  adornment: string
  value: string
  widthCh: number
  inputRef: React.RefObject<HTMLInputElement>
  onChange: (event: React.ChangeEvent<MathEditorElement>) => void
  onKeyDown: (event: React.KeyboardEvent<MathEditorElement>) => void
}

export interface BlockEditorProps {
  adornment: string
  value: string
  inputRef: React.RefObject<HTMLTextAreaElement>
  onChange: (event: React.ChangeEvent<MathEditorElement>) => void
  onKeyDown: (event: React.KeyboardEvent<MathEditorElement>) => void
}

export interface MathPreviewProps {
  html: string
  hasError: boolean
}

const inlineWidthBuffer = 1

export function renderKatexHtml(latex: string, options: KatexOptions, displayMode: boolean): RenderResult {
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

export function getInlineInputWidth(value: string) {
  return Math.max(value.length, 1) + inlineWidthBuffer
}

export function InlineEditor({
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

export function BlockEditor({
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

export function MathPreview({ html, hasError }: MathPreviewProps) {
  return (
    <span
      className={cn(hasError && styles.mathError)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
