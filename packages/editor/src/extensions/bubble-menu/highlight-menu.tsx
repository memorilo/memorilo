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

const sharedHighlightButtonClassName = 'px-0 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground'

interface HighlightMenuProps {
  editor: Editor
  compact?: boolean
}

export function HighlightMenu({ editor, compact = false }: HighlightMenuProps) {
  const { t } = useTranslation('app')
  const [open, setOpen] = useState(false)
  const currentColor = editor.getAttributes('highlight').color as string | undefined
  const isActive = editor.isActive('highlight')

  const applyHighlight = () => {
    editor.chain().focus().setHighlight({ color: currentColor ?? defaultHighlightColor }).run()
  }

  const handleColorChange = (color: ColorResult) => {
    editor.chain().focus().setHighlight({ color: color.hex }).run()
    setOpen(false)
  }

  return (
    <div className="flex items-center">
      <Button
        aria-label={t('editor.highlight.mark')}
        aria-pressed={isActive}
        className={cn(
          sharedHighlightButtonClassName,
          compact ? 'h-7 w-7 rounded-r-none' : 'h-8 w-8 rounded-r-none',
          isActive && 'bg-accent text-accent-foreground',
        )}
        onMouseDown={event => event.preventDefault()}
        onClick={applyHighlight}
        size="icon-sm"
        type="button"
        variant="ghost"
        data-testid="bubble-highlight-toggle"
      >
        <MdOutlineHighlight size={16} />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label={t('editor.highlight.mark_options')}
            className={cn(
              sharedHighlightButtonClassName,
              compact ? 'h-7 w-5 rounded-l-none' : 'h-8 w-6 rounded-l-none',
              isActive && 'bg-accent text-accent-foreground',
            )}
            onMouseDown={event => event.preventDefault()}
            size="icon-sm"
            type="button"
            variant="ghost"
            data-testid="bubble-highlight-options"
          >
            <MdArrowDropDown size={16} />
          </Button>
        </PopoverTrigger>
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
