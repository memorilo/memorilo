import type { MemoriloElementStrings, MemoriloMarkupStrings } from '../slate'
import { Editor, Element, Text, Transforms } from 'slate'

/* Block Helpers */

export function isBlockActive(editor: Editor, type: MemoriloElementStrings) {
  if (!editor.selection)
    return false
  const [match] = Array.from(
    Editor.nodes(editor, {
      at: Editor.unhangRange(editor, editor.selection),
      match: n => Element.isElement(n) && Editor.isBlock(editor, n) && n.type === type,
    }),
  )
  return !!match
}

export function toggleCurrentBlock(editor: Editor, type: MemoriloElementStrings) {
  Transforms.setNodes(
    editor,
    { type: isBlockActive(editor, type) ? undefined : type },
    { match: n => Element.isElement(n) && Editor.isBlock(editor, n) },
  )
}

/* Markup Helpers */

export function isMarkActive(editor: Editor, type: MemoriloMarkupStrings) {
  const marks = Editor.marks(editor)
  return marks ? marks[type] === true : false
}

export function toggleMark(editor: Editor, type: MemoriloMarkupStrings) {
  Transforms.setNodes(
    editor,
    { [type]: !isMarkActive(editor, type) },
    { match: n => Text.isText(n), split: true },
  )
}
