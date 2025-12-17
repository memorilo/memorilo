import type { RenderElementProps } from 'slate-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@memorilo/components/ui/tooltip'
import { cn } from '@memorilo/utils'
import { useMemo } from 'react'
import { Node, Transforms } from 'slate'
import { ReactEditor, useFocused, useSelected, useSlateStatic } from 'slate-react'
import { renderKatex } from './renderer'
import 'katex/dist/katex.min.css'

export function MathBlock(props: RenderElementProps) {
  const editor = useSlateStatic()
  const selected = useSelected()
  const focused = useFocused()
  const equation = useMemo(() => Node.string(props.element), [props.element])

  const renderedEquation = useMemo(
    () => renderKatex(equation, { displayMode: true, as: 'div' }),
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
            <div
              className="flex flex-col px-1 py-0.5 mx-0.5 rounded-md text-sm text-red-700 before:content-['$$'] before:font-bold before:text-blue-600 before:block before:leading-none after:content-['$$'] after:font-bold after:text-blue-600 after:block after:leading-none"
              {...props.attributes}
            >
              {props.children}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {renderedEquation}
          </TooltipContent>
        </Tooltip>
      )
    : (
        <div
          {...props.attributes}
          className="relative align-middle w-full flex justify-center"
        >
          <div className={cn('font-mono text-sm flex-1', isEditing ? 'static opacity-100 whitespace-pre-wrap break-all' : 'absolute inset-0 opacity-0 w-0 h-0 overflow-hidden pointer-events-none')}>
            {props.children}
          </div>
          <div onClick={handlePreviewClick}>
            {renderedEquation}
          </div>
        </div>
      )
}
