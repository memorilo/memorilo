import type { RenderElementProps } from 'slate-react'
import type { LinkElementType } from '../../slate'
import { openURL } from '@memorilo/api/open'
import { Tooltip, TooltipContent, TooltipTrigger } from '@memorilo/components/ui/tooltip'
import { cn } from '@memorilo/utils'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useKeyPress } from 'react-use'

export function Link(rawProps: RenderElementProps) {
  const props = rawProps as RenderElementProps & { element: LinkElementType }
  const { t } = useTranslation('app')

  const openWithCtrl = true // TODO: maybe make this configurable?

  const [isMetaPressed] = useKeyPress('Meta') // Cmd on Mac
  const [isCtrlPressed] = useKeyPress('Control') // Ctrl on Windows/Linux
  const isModifierPressed = isMetaPressed || isCtrlPressed

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (openWithCtrl && !isModifierPressed) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    openURL(props.element.url)
  }, [isModifierPressed, openWithCtrl, props.element.url])

  const element = (
    <a
      {...props.attributes}
      href={props.element.url}
      target="_blank"
      className={cn(
        'text-blue-500 underline',
        {
          'cursor-pointer': !openWithCtrl || isModifierPressed,
        },
      )}
      onClick={handleClick}
      rel="noopener noreferrer"
    >
      {props.children}
    </a>
  )

  if (openWithCtrl && !isModifierPressed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {element}
        </TooltipTrigger>
        <TooltipContent>
          {t('editor.link.openWithModifier')}
        </TooltipContent>
      </Tooltip>
    )
  }
  return element
}
