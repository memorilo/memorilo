import type { JSX } from 'react'

import type { MemoriloElementStrings, MemoriloMarkupStrings } from '../slate'
import { cn } from '@memorilo/utils'

import { ReactEditor, useSlateStatic } from 'slate-react'
import { isBlockActive, isMarkActive, toggleCurrentBlock, toggleMark } from '../lib/editorHelper'
import { ELEMENTS } from './elements'

import { MARKUPS } from './markups'
import { UtilButton } from './util-button'

type FormatButtonProps = {
  symbol: string | JSX.Element
  element: MemoriloElementStrings
} | {
  symbol: string | JSX.Element
  markup: MemoriloMarkupStrings
}

function FormatButton(props: FormatButtonProps) {
  const editor = useSlateStatic()

  if ('element' in props) {
    return (
      <UtilButton
        title={ELEMENTS[props.element].key.join(' + ').toUpperCase()}
        className={cn(
          isBlockActive(editor, props.element) ? 'text-blue-600 font-bold' : '',
          props.element === 'plain' && isBlockActive(editor, 'plain') ? 'pointer-events-none' : '',
        )}
        onMouseDown={(e: any) => {
          e.preventDefault()
          toggleCurrentBlock(editor, props.element)
          ReactEditor.focus(editor)

          const afterClick = ELEMENTS[props.element].afterClick
          if (afterClick) {
            afterClick(editor)
          }
        }}
      >
        {props.symbol}
      </UtilButton>
    )
  }

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

export default FormatButton
