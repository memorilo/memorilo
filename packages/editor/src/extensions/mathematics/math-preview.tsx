import type { KatexOptions } from 'katex'
import type { HTMLAttributes, MutableRefObject, Ref } from 'react'
import { cn } from '@memorilo/utils'
import katex from 'katex'
import { createElement, useCallback, useLayoutEffect, useRef } from 'react'

const previewErrorClasses = ['font-mono', 'text-red-600']

export interface MathPreviewProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'ref'> {
  as?: 'div' | 'span'
  latex: string
  displayMode: boolean
  katexOptions?: KatexOptions
  ref?: Ref<HTMLElement>
}

export function MathPreview({
  as = 'div',
  className,
  latex,
  displayMode,
  katexOptions,
  ref: forwardedRef,
  ...props
}: MathPreviewProps) {
  const previewRef = useRef<HTMLElement | null>(null)

  const handleRef = useCallback((node: HTMLElement | null) => {
    previewRef.current = node
    if (typeof forwardedRef === 'function') {
      forwardedRef(node)
      return
    }

    if (forwardedRef) {
      ;(forwardedRef as MutableRefObject<HTMLElement | null>).current = node
    }
  }, [forwardedRef])

  useLayoutEffect(() => {
    const preview = previewRef.current
    if (!preview) {
      return
    }

    try {
      katex.render(latex, preview, {
        ...katexOptions,
        displayMode,
        throwOnError: false,
      })
      preview.classList.remove(...previewErrorClasses)
    }
    catch {
      preview.textContent = latex
      preview.classList.add(...previewErrorClasses)
    }
  }, [displayMode, katexOptions, latex])

  return createElement(as, {
    ...props,
    ref: handleRef,
    className: cn(className),
    contentEditable: false,
  })
}
