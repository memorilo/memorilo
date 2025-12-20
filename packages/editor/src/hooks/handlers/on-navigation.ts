import type { KeyboardEvent } from 'react'
import type { Editor } from 'slate'

export function onNavigation(event: KeyboardEvent<HTMLDivElement>, editor: Editor): boolean {
  // Handle arrow up and arrow left and focus to title
  if (
    (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
    && editor.selection?.anchor.path[0] === 0
    && editor.selection?.anchor.offset === 0
  ) {
    event.preventDefault()
    // TODO: focus title
    return true
  }
  return false
}
