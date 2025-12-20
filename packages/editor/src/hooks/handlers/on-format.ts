import type { KeyboardEvent } from 'react'
import type { Editor } from 'slate'
import type { MemoriloElementStrings, MemoriloMarkupStrings } from '../../slate'
import { ELEMENTS } from '../../components/elements'
import { MARKUPS } from '../../components/markups'
import { toggleCurrentBlock, toggleMark } from '../../lib/editorHelper'

export function onFormat(event: KeyboardEvent<HTMLDivElement>, editor: Editor): boolean {
  // Handle Ctrl keys
  if (event.ctrlKey) {
    // Match key combination for elements
    const match = Object.entries(ELEMENTS).find(([, { key }]) => key[0] === 'ctrl' && key[1] === event.key)
    if (match) {
      event.preventDefault()
      toggleCurrentBlock(editor, match[0] as MemoriloElementStrings)
      return true
    }

    // Match key combination for markups
    const match_m = Object.entries(MARKUPS).find(([, { key }]) => key[0] === 'ctrl' && key[1] === event.key)
    if (match_m) {
      event.preventDefault()
      toggleMark(editor, match_m[0] as MemoriloMarkupStrings)
      return true
    }
  }
  return false
}
