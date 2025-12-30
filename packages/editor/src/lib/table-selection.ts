import type { Editor } from 'slate'
import { TableCursor } from 'slate-table'

export function isTableSelectionActive(editor: Editor): boolean {
  try {
    return !TableCursor.selection(editor).next().done
  }
  catch {
    return false
  }
}
