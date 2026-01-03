import type { KeyboardEvent } from 'react'
import type { Editor } from 'slate'
import isHotkey from 'is-hotkey'
import { TableCursor, TableEditor } from 'slate-table'

export function onTableNavigation(event: KeyboardEvent<HTMLDivElement>, editor: Editor): boolean {
  if (TableCursor.isInTable(editor)) {
    if (isHotkey('up', event) && TableCursor.isOnEdge(editor, 'top')) {
      event.preventDefault()
      return TableCursor.upward(editor)
    }
    else if (isHotkey('down', event) && TableCursor.isOnEdge(editor, 'bottom')) {
      event.preventDefault()
      return TableCursor.downward(editor)
    }
    else if (isHotkey('left', event) && TableCursor.isOnEdge(editor, 'start')) {
      event.preventDefault()
      return TableCursor.backward(editor)
    }
    else if (isHotkey('right', event) && TableCursor.isOnEdge(editor, 'end')) {
      event.preventDefault()
      return TableCursor.forward(editor)
    }
    else if (isHotkey('tab', event)) {
      if (TableCursor.isInLastCell(editor)) {
        TableEditor.insertRow(editor)
      }
      event.preventDefault()
      return TableCursor.forward(editor, { mode: 'all' })
    }
    else if (isHotkey('shift+tab', event)) {
      event.preventDefault()
      return TableCursor.backward(editor, { mode: 'all' })
    }
  }
  return false
}
