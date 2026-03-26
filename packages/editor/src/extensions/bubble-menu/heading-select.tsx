import type { Editor } from '@tiptap/core'
import type { HeadingLevel } from '../heading'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@memorilo/components/ui/select'
import { cn } from '@memorilo/utils'
import { useTranslation } from 'react-i18next'
import { headingLabelKeyByLevel, headingLevels } from '../heading'

type HeadingValue = 'paragraph' | `${HeadingLevel}`

interface HeadingOption {
  value: HeadingValue
  label: string
  icon: string
}

const headingLevelSet = new Set<HeadingLevel>(headingLevels)
function getHeadingValue(editor: Editor): HeadingValue {
  const parent = editor.state.selection.$from.parent
  if (parent.type.name !== 'heading') {
    return 'paragraph'
  }

  const level = parent.attrs.level as HeadingLevel
  if (!headingLevelSet.has(level)) {
    throw new Error(`Unsupported heading level in selection: ${String(level)}`)
  }

  return String(level) as HeadingValue
}

function applyHeadingValue(editor: Editor, value: HeadingValue) {
  const chain = editor.chain().focus()
  if (value === 'paragraph') {
    chain.setParagraph().run()
    return
  }

  chain.setHeading({ level: Number(value) as HeadingLevel }).run()
}

interface HeadingSelectProps {
  editor: Editor
  compact?: boolean
}

export function HeadingSelect({ editor, compact = false }: HeadingSelectProps) {
  const { t } = useTranslation('app')
  const translate = (key: string) => t(key as never) as string
  const headingValue = getHeadingValue(editor)
  const headingOptions: HeadingOption[] = [
    { value: 'paragraph', label: translate('editor.heading.paragraph'), icon: '¶ ' },
    ...headingLevels.map(level => ({
      value: String(level) as HeadingValue,
      label: translate(headingLabelKeyByLevel[level]),
      icon: `H${level}`,
    })),
  ]
  const selectedOption = headingOptions.find(option => option.value === headingValue)
  if (!selectedOption) {
    throw new Error(`Unsupported heading value: ${headingValue}`)
  }

  return (
    <Select
      value={headingValue}
      onValueChange={value => applyHeadingValue(editor, value as HeadingValue)}
    >
      <SelectTrigger
        aria-label={translate('editor.heading.level')}
        className={cn(
          'max-w-full shrink-0 border-none bg-transparent shadow-none ring-0 outline-none',
          'h-8 min-w-[112px] px-2',
          compact ? 'h-7 min-w-0 w-10 gap-0.5 px-1 [&_svg]:size-3.5' : 'h-8 min-w-[112px] px-2',
        )}
        size="sm"
        data-testid="bubble-heading-trigger"
      >
        <span
          className="min-w-0 flex-1"
          data-testid="bubble-heading-trigger-label"
        >
          {compact
            ? (
                <span className="flex min-w-0 flex-1 items-center justify-center text-sm font-medium">
                  {selectedOption.icon.trim()}
                </span>
              )
            : (
                <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left">
                  <span className="w-[2em] shrink-0 text-center font-bold">
                    {selectedOption.icon}
                  </span>
                  <span className="truncate">
                    {selectedOption.label}
                  </span>
                </span>
              )}
        </span>
      </SelectTrigger>
      <SelectContent position="popper" side="bottom" align="start" sideOffset={8}>
        {headingOptions.map(option => (
          <SelectItem
            key={option.value}
            value={option.value}
            textValue={option.label}
            data-testid={`bubble-heading-option-${option.value}`}
          >
            <span className="w-[2em] text-center font-bold">
              {option.icon}
            </span>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
