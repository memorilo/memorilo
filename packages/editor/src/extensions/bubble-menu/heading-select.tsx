import type { Editor } from '@tiptap/core'
import type { HeadingLevel } from '../outline/nodes/heading'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@memorilo/components/ui/select'
import { headingLabelByLevel, headingLevels } from '../outline/nodes/heading'

type HeadingValue = 'paragraph' | `${HeadingLevel}`

interface HeadingOption {
  value: HeadingValue
  label: string
  icon: string
}

const headingLevelSet = new Set<HeadingLevel>(headingLevels)
const headingOptions: HeadingOption[] = [
  { value: 'paragraph', label: 'Plain', icon: '¶ ' },
  ...headingLevels.map(level => ({
    value: String(level) as HeadingValue,
    label: headingLabelByLevel[level],
    icon: `H${level}`,
  })),
]

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
  const headingValue = getHeadingValue(editor)

  return (
    <Select
      value={headingValue}
      onValueChange={value => applyHeadingValue(editor, value as HeadingValue)}
    >
      <SelectTrigger
        aria-label="Heading level"
        className="min-w-[110px] border-none ring-none box-shadow-none outline-none"
        onMouseDown={event => event.preventDefault()}
        size="sm"
      >
        <SelectValue placeholder="Plain" className="border-none ring-none box-shadow-none outline-none" />
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
