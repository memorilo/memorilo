import type { Editor, Range } from 'slate'
import type { LinkElementType } from '../../slate'
import { Iterable, Option, pipe } from 'effect'
import { Editor as SlateEditor, Element as SlateElement, Range as SlateRange, Transforms } from 'slate'
import { isLink } from '../element-type'

export interface InsertLinkOptions {
  /**
   * When true, unwraps existing link nodes in the target range before inserting/wrapping.
   * Useful to avoid creating nested links when applying a new URL.
   */
  unwrapExisting?: boolean
}

export function unwrapLink(editor: Editor, at: Range) {
  Transforms.unwrapNodes(editor, {
    at,
    match: n => SlateElement.isElement(n) && isLink(n),
    split: true,
  })
}

export function getLinkUrlInRange(editor: Editor, at: Range): string | undefined {
  return pipe(
    SlateEditor.nodes(editor, {
      at,
      match: n => SlateElement.isElement(n) && isLink(n),
      mode: 'lowest',
    }),
    Iterable.head,
    Option.map(([node]) => (node as LinkElementType).url as string),
    Option.getOrUndefined,
  )
}

export function setLinkUrlInRange(editor: Editor, at: Range, url: string) {
  Transforms.setNodes(
    editor,
    { url } as any,
    {
      at,
      match: n => SlateElement.isElement(n) && isLink(n),
      split: true,
    },
  )
}

/**
 * Insert or wrap the selection with a link element.
 * If selection is collapsed, inserts a link node with the URL as its text.
 */
export function insertLink(editor: Editor, url: string, options?: InsertLinkOptions) {
  if (!editor.selection)
    return

  const at = SlateEditor.unhangRange(editor, editor.selection)
  if (options?.unwrapExisting)
    unwrapLink(editor, at)

  if (SlateRange.isCollapsed(at)) {
    Transforms.insertNodes(editor, { type: 'link', url, children: [{ text: url }] } as any)
    return
  }

  Transforms.wrapNodes(editor, { type: 'link', url, children: [] } as any, { at, split: true })
  Transforms.collapse(editor, { edge: 'end' })
}
