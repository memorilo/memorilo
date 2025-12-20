import type { KeyboardEvent } from 'react'
import type { Editor } from 'slate'
import isHotKey from 'is-hotkey'
import { Transforms } from 'slate'

export function onSoftBreak(event: KeyboardEvent<HTMLDivElement>, editor: Editor): boolean {
  // Handle soft line breaks (So Shift + Enter won't create new paragraph)
  if (isHotKey('shift+enter', event)) {
    event.preventDefault()
    Transforms.insertText(editor, '\n')
    return true
  }
  return false
}
