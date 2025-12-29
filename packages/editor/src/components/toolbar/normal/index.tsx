import type { MemoriloMarkupStrings } from '../../../slate'
import { Separator } from '@memorilo/components/ui/separator'
import { MARKUPS } from '../../markups'
import { BlockTypeSelect } from './block-type-select'
import { LinkToggleButton } from './link-toggle-button'
import MarkupFormatButton from './markup-format-button'
import { TodoToggleButton } from './todo-toggle-button'

export function NormalToolbarButtons() {
  return (
    <>
      <BlockTypeSelect />
      <Separator orientation="vertical" />
      <LinkToggleButton />
      <Separator orientation="vertical" />
      {/* Markup buttons (bold, italic, etc) */}
      {Object.entries(MARKUPS).map(([name, value]) => {
        return (
          <MarkupFormatButton
            key={name}
            symbol={value.symbol}
            markup={name as MemoriloMarkupStrings}
          />
        )
      })}
      <Separator orientation="vertical" />
      <TodoToggleButton />
    </>
  )
}
