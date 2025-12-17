import type { ReactElement } from 'react'
import { cn } from '@memorilo/utils'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface RenderKatexOptions {
  displayMode?: boolean
  as?: 'div' | 'span'
  className?: string
  errorClassName?: string
}

export function renderKatex(
  equation: string,
  { displayMode = false, as = 'span', className, errorClassName }: RenderKatexOptions = {},
): ReactElement {
  try {
    const rendered = katex.renderToString(equation, {
      displayMode,
      throwOnError: true,
    })

    const baseClass = 'px-1 py-0.5 mx-0.5 align-baseline rounded-md text-sm cursor-pointer select-none min-w-1'
    const Component = as

    return (
      <Component
        className={cn(baseClass, className)}
        // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml
        dangerouslySetInnerHTML={{ __html: rendered }}
        contentEditable={false}
      />
    )
  }
  catch {
    const Component = as
    return (
      <Component className={errorClassName ?? 'text-red-500 px-2 py-1 border border-red-500 m-2'}>
        Invalid LaTeX
      </Component>
    )
  }
}
