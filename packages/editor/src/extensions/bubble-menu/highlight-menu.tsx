import type { Editor } from '@tiptap/core'
import type { ColorResult } from 'react-color'
import { Button } from '@memorilo/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { cn } from '@memorilo/utils'
import { useState } from 'react'
import { BlockPicker } from 'react-color'
import { useTranslation } from 'react-i18next'
import { MdArrowDropDown, MdOutlineHighlight } from 'react-icons/md'

const defaultHighlightColor = '#fef08a'
const highlightPalette = [
  '#fef08a',
  '#fecaca',
  '#fdba74',
  '#fcd34d',
  '#bbf7d0',
  '#a7f3d0',
  '#bfdbfe',
  '#c7d2fe',
  '#e9d5ff',
  '#f5d0fe',
]

interface HighlightMenuProps {
  editor: Editor
}

export function HighlightMenu({ editor }: HighlightMenuProps) {
  const { t } = useTranslation('app')
  const [open, setOpen] = useState(false)
  const currentColor = editor.getAttributes('highlight').color as string | undefined
  const isActive = editor.isActive('highlight')

  const applyHighlight = () => {
    editor.commands.focus()
    editor.commands.setHighlight({ color: currentColor ?? defaultHighlightColor })
  }

  const handleColorChange = (color: ColorResult) => {
    editor.commands.focus()
    editor.commands.setHighlight({ color: color.hex })
    setOpen(false)
  }

  return (
    <div className="flex items-center">
      <Button
        aria-label={t('editor.highlight.mark')}
        aria-pressed={isActive}
        className={cn(
          'h-8 w-8 rounded-r-none px-0',
          isActive && 'bg-accent text-accent-foreground',
        )}
        onMouseDown={event => event.preventDefault()}
        onClick={applyHighlight}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <MdOutlineHighlight size={16} />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={popoverProps => (
          <Button
            {...popoverProps}
            aria-label={t('editor.highlight.mark_options')}
            className={cn(
              'h-8 w-6 rounded-l-none px-0',
              isActive && 'bg-accent text-accent-foreground',
              popoverProps.className,
            )}
            onMouseDown={(event) => {
              popoverProps.onMouseDown?.(event)
              event.preventDefault()
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MdArrowDropDown size={16} />
          </Button>
        )}
      />
        <PopoverContent side="top" align="end" className="p-2">
          <BlockPicker
            color={currentColor ?? defaultHighlightColor}
            colors={highlightPalette}
            onChangeComplete={handleColorChange}
            triangle="hide"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
