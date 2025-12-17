import type { RenderElementProps } from 'slate-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@memorilo/components/ui/tooltip'
import { cn } from '@memorilo/utils'
import { useMemo } from 'react'
import { Node, Transforms } from 'slate'
import { ReactEditor, useFocused, useSelected, useSlateStatic } from 'slate-react'
import { renderKatex } from './renderer'
import 'katex/dist/katex.min.css'

export function MathInline(props: RenderElementProps) {
  const editor = useSlateStatic()
  const selected = useSelected()
  const focused = useFocused()
  const equation = useMemo(() => Node.string(props.element), [props.element])

  const renderedEquationBlock = useMemo(
    () => renderKatex(equation, { displayMode: true, as: 'div' }),
    [equation],
  )

  const renderedEquation = useMemo(
    () => renderKatex(equation, { displayMode: false, as: 'span' }),
    [equation],
  )

  const handlePreviewClick = () => {
    const path = ReactEditor.findPath(editor, props.element)
    Transforms.select(editor, path)
    ReactEditor.focus(editor)
  }

  const isEditing = selected && focused

  return isEditing
    ? (
        <Tooltip open={true}>
          <TooltipTrigger asChild>
            <span
              className="px-1 py-0.5 mx-0.5 align-baseline rounded-md text-sm text-red-700 before:content-['$'] before:font-bold before:pr-1 before:text-blue-600 after:content-['$'] after:font-bold after:pl-1 after:text-blue-600"
              {...props.attributes}
            >
              {props.children}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {renderedEquationBlock}
          </TooltipContent>
        </Tooltip>
      )
    : (
        <span
          {...props.attributes}
          className="relative inline-block align-middle"
        >
          <span className={cn('font-mono text-sm', isEditing ? 'static opacity-100 whitespace-pre-wrap break-all' : 'absolute inset-0 opacity-0 w-0 h-0 overflow-hidden pointer-events-none')}>
            {props.children}
          </span>
          <span onClick={handlePreviewClick}>
            {renderedEquation}
          </span>
        </span>
      )
}
