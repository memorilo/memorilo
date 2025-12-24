import type { RenderElementProps } from 'slate-react'
import type { LinkElementType } from '../../slate'
import { openURL } from '@memorilo/api/open'
import { Tooltip, TooltipContent, TooltipTrigger } from '@memorilo/components/ui/tooltip'
import { cn } from '@memorilo/utils'
import { useMemo } from 'react'
import { useKeyPress } from 'react-use'

export function Link(pprops: RenderElementProps) {
  const props = pprops as RenderElementProps & { element: LinkElementType }

  const openWithCtrl = true // TODO: maybe make this configurable?

  const [isCtrlPressed] = useKeyPress('Meta') // Cmd on Mac, Ctrl on Windows/Linux

  const handleClick = useMemo(() => {
    if (openWithCtrl && !isCtrlPressed) {
      return undefined
    }
    return (event: React.MouseEvent) => {
      openURL(props.element.url)
      event.preventDefault()
    }
  }, [openWithCtrl, isCtrlPressed, props.element.url])

  const element = (
    <a
      {...props.attributes}
      href={props.element.url}
      target="__blank"
      className={cn(
        'text-blue-500 underline',
        {
          'cursor-pointer': !openWithCtrl || isCtrlPressed,
        },
      )}
      onClick={handleClick}
      rel="noopener noreferrer"
    >
      {props.children}
    </a>
  )

  if (openWithCtrl && !isCtrlPressed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {element}
        </TooltipTrigger>
        <TooltipContent>
          Press Cmd/Ctrl and click to open link
        </TooltipContent>
      </Tooltip>
    )
  }
  return element
}
