import type { Path, Point, Range } from 'slate'
import { Editor, Element as SlateElement, Range as SlateRange } from 'slate'
import { isCodeblock, isCodeLine, isIndent } from '../element-type'

/**
 * Slash-command triggers supported by the editor.
 * - `/` for the typical slash command.
 * - `、` for an alternative trigger used in some IME workflows.
 */
const TRIGGER_CHARS = ['/', '、'] as const

export interface SlashTriggerMatch {
  key: string
  query: string
  range: Range
  blockPath: Path
  slashPoint: Point
}

function getTriggerBlockEntry(editor: Editor) {
  if (!editor.selection)
    return null

  const at = editor.selection.anchor

  // Never trigger inside code blocks.
  const inCode = Editor.above(editor, {
    at,
    match: n => SlateElement.isElement(n) && (isCodeblock(n) || isCodeLine(n)),
  })
  if (inCode)
    return null

  /**
   * We intentionally pick the closest non-indent block as the "trigger container".
   * This keeps `/` parsing scoped to the current visual line in the editor.
   */
  return Editor.above(editor, {
    at,
    match: n =>
      SlateElement.isElement(n)
      && Editor.isBlock(editor, n)
      && !isIndent(n)
      && !isCodeblock(n)
      && !isCodeLine(n),
    mode: 'lowest',
  })
}

function lastTriggerIndex(line: string) {
  let bestIndex = -1
  let bestChar: typeof TRIGGER_CHARS[number] | null = null
  for (const ch of TRIGGER_CHARS) {
    const index = line.lastIndexOf(ch)
    if (index > bestIndex) {
      bestIndex = index
      bestChar = ch
    }
  }
  return bestChar ? { index: bestIndex, char: bestChar } : null
}

export function getSlashTrigger(editor: Editor): SlashTriggerMatch | null {
  if (!editor.selection || !SlateRange.isCollapsed(editor.selection))
    return null

  const blockEntry = getTriggerBlockEntry(editor)
  if (!blockEntry)
    return null

  const [, blockPath] = blockEntry
  const cursor = editor.selection.anchor
  const blockStart = Editor.start(editor, blockPath)
  const blockEnd = Editor.end(editor, blockPath)

  /**
   * Only trigger when there is no meaningful content after the cursor
   * on the current visual line (allow trailing whitespace).
   *
   * This prevents opening the palette when typing in the middle of a sentence.
   */
  const afterText = Editor.string(editor, { anchor: cursor, focus: blockEnd })
  // Accept both half-width and full-width spaces (and other Unicode whitespace).
  if (!/^\s*$/.test(afterText))
    return null

  const beforeText = Editor.string(editor, { anchor: blockStart, focus: cursor })
  const lastNewlineIndex = beforeText.lastIndexOf('\n')
  const currentLine = lastNewlineIndex === -1 ? beforeText : beforeText.slice(lastNewlineIndex + 1)

  const triggerIndex = lastTriggerIndex(currentLine)
  if (!triggerIndex)
    return null

  // Query is the contiguous token after the trigger (no spaces).
  const query = currentLine.slice(triggerIndex.index + 1)
  if (/\s/.test(query))
    return null

  const distance = currentLine.length - triggerIndex.index
  const slashPoint = Editor.before(editor, cursor, { unit: 'character', distance })
  if (!slashPoint)
    return null

  const range: Range = { anchor: slashPoint, focus: cursor }
  const key = `${slashPoint.path.join('.')}:${slashPoint.offset}`

  return { key, query, range, blockPath, slashPoint }
}
