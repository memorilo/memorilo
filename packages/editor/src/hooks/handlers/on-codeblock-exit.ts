import type { KeyboardEvent } from 'react'
import type { Editor, NodeEntry } from 'slate'
import { Node, Path, Range, Editor as SlateEditor, Transforms } from 'slate'
import { isCodeblock, isCodeLine } from '../../lib/element-type'

function getCurrentCodeContext(editor: Editor): {
  codeblockEntry: NodeEntry
  codeLineEntry: NodeEntry
} | null {
  if (!editor.selection || !Range.isCollapsed(editor.selection))
    return null

  const codeLineEntry = SlateEditor.above(editor, {
    at: editor.selection,
    match: n => isCodeLine(n),
  })

  if (!codeLineEntry)
    return null

  const codeblockEntry = SlateEditor.above(editor, {
    at: codeLineEntry[1],
    match: n => isCodeblock(n),
  })

  if (!codeblockEntry)
    return null

  return { codeblockEntry, codeLineEntry }
}

/**
 * In a code block, pressing Enter twice at the end should:
 * - Create a sibling `plain` block after the `codeblock` (same hierarchy level)
 * - Move cursor into the new `plain` block
 *
 * We detect the "second Enter" by checking whether the cursor is currently inside
 * the last, empty `code-line` of the `codeblock`. This empty line is typically
 * created by the first Enter at the end of the previous line.
 */
export function onCodeblockExit(event: KeyboardEvent<HTMLDivElement>, editor: Editor): boolean {
  if (event.key !== 'Enter' || event.shiftKey)
    return false

  const ctx = getCurrentCodeContext(editor)
  if (!ctx)
    return false

  const [codeblockNode, codeblockPath] = ctx.codeblockEntry
  const [codeLineNode, codeLinePath] = ctx.codeLineEntry

  if (!isCodeblock(codeblockNode) || !isCodeLine(codeLineNode))
    return false

  // We only "exit" when cursor is at end of the last, empty code line.
  if (!SlateEditor.isEnd(editor, editor.selection!.focus, codeLinePath))
    return false

  const codeLineText = Node.string(codeLineNode)
  if (codeLineText.length !== 0)
    return false

  const lastChildIndex = codeblockNode.children.length - 1
  if (!Path.equals(Path.parent(codeLinePath), codeblockPath))
    return false

  const codeLineIndexInCodeblock = codeLinePath[codeblockPath.length]
  if (codeLineIndexInCodeblock !== lastChildIndex)
    return false

  event.preventDefault()

  // Insert the new plain block as a sibling right after the codeblock.
  const plainInsertPath = Path.next(codeblockPath)

  SlateEditor.withoutNormalizing(editor, () => {
    // Avoid leaving a trailing empty line when the codeblock already has content.
    // If the codeblock only contains one empty code-line, keep it (normalize will enforce this anyway).
    if (codeblockNode.children.length > 1) {
      Transforms.removeNodes(editor, { at: codeLinePath })
    }

    Transforms.insertNodes(editor, { type: 'plain', children: [{ text: '' }] }, { at: plainInsertPath })
    Transforms.select(editor, SlateEditor.start(editor, plainInsertPath))
  })

  return true
}
