import type { Editor, Range } from 'slate'
import { Range as SlateRange, Transforms } from 'slate'
import { TableCursor } from 'slate-table'

export function isTableSelectionActive(editor: Editor): boolean {
  try {
    return !TableCursor.selection(editor).next().done
  }
  catch {
    return false
  }
}

export function snapshotTableSelection(editor: Editor): Range | null {
  if (!editor.selection)
    return null

  const { anchor, focus } = editor.selection
  return {
    anchor: { ...anchor },
    focus: { ...focus },
  }
}

export function restoreTableSelection(editor: Editor, selection: Range | null): void {
  if (!selection || !SlateRange.isRange(selection))
    return

  Transforms.collapse(editor, { edge: 'anchor' })
  Transforms.select(editor, selection)
}
