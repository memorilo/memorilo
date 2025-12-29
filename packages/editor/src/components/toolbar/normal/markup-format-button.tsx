import type { JSX } from 'react'

import type { MemoriloMarkupStrings } from '../../../slate'
import { cn } from '@memorilo/utils'

import { ReactEditor, useSlateStatic } from 'slate-react'
import { isMarkActive, toggleMark } from '../../../lib/editorHelper'

import { MARKUPS } from '../../markups'
import { UtilButton } from '../../util-button'

interface FormatButtonProps {
  symbol: string | JSX.Element
  markup: MemoriloMarkupStrings
}

function MarkupFormatButton(props: FormatButtonProps) {
  const editor = useSlateStatic()

  return (
    <UtilButton
      title={MARKUPS[props.markup].key.join(' + ').toUpperCase()}
      className={cn(
        isMarkActive(editor, props.markup) ? 'text-blue-600 font-bold' : '',
      )}
      onMouseDown={(e: any) => {
        e.preventDefault()
        toggleMark(editor, props.markup)
        ReactEditor.focus(editor)
      }}
    >
      {props.symbol}
    </UtilButton>
  )
}

export default MarkupFormatButton
