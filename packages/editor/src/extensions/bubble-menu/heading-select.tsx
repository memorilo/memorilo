import type { Editor } from '@tiptap/core'
import type { HeadingLevel } from '../heading'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memorilo/components/ui/select'
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
  return headingLevelSet.has(level) ? String(level) as HeadingValue : 'paragraph'
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
}

export function HeadingSelect({ editor }: HeadingSelectProps) {
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

  return (
    <Select
      value={headingValue}
      onValueChange={value => applyHeadingValue(editor, value as HeadingValue)}
    >
      <SelectTrigger
        aria-label={translate('editor.heading.level')}
        className="min-w-[110px] border-none ring-none box-shadow-none outline-none"
        onMouseDown={event => event.preventDefault()}
        size="sm"
      >
        <SelectValue
          placeholder={translate('editor.heading.paragraph')}
          className="border-none ring-none box-shadow-none outline-none"
        />
      </SelectTrigger>
      <SelectContent>
        {headingOptions.map(option => (
          <SelectItem key={option.value} value={option.value}>
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
