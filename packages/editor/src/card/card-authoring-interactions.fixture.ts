import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import { act, waitFor } from '@testing-library/react'
import { expect } from 'vitest'
import { placeCaretAtStart, userEvent } from '../../test/browser/user-event'

export const adapters: EditorAdapters = {
  uploadImage: async () => 'memory://image',
  tagStorage: {
    create: async tag => tag,
    search: async () => [],
    update: async tag => tag,
  },
}

export function block(id: string, body: NodeJSON): NodeJSON {
  return {
    type: 'list',
    attrs: { blockId: id, checked: false, collapsed: false, kind: 'outline', order: null },
    content: [body],
  }
}

export function paragraph(text: string): NodeJSON {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

export function textBoundary(root: HTMLElement, offset: number): { node: Text, offset: number } {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = offset
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    if (remaining <= text.data.length)
      return { node: text, offset: remaining }
    remaining -= text.data.length
  }
  throw new Error(`Text offset ${offset} is outside formula source ${JSON.stringify(root.textContent)}`)
}

export async function selectTextRange(element: HTMLElement, from: number, to: number): Promise<void> {
  const start = textBoundary(element, from)
  const end = textBoundary(element, to)
  await act(async () => {
    const selection = document.getSelection()
    if (!selection)
      throw new Error('Document selection is unavailable')
    const range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
}

export async function openInlineMathSource(container: HTMLElement): Promise<HTMLElement> {
  const paragraph = container.querySelector<HTMLElement>('[data-block-id="inline-formula"] > .list-content > p')
  if (!paragraph)
    throw new Error('Inline formula paragraph was not rendered')
  await placeCaretAtStart(paragraph)
  await userEvent.keyboard('{End}')
  await userEvent.keyboard('{ArrowLeft}')
  return waitFor(() => {
    const source = container.querySelector<HTMLElement>('.prosemirror-math-inline .prosemirror-math-source code')
    if (!source)
      throw new Error('Inline formula source editor was not rendered')
    expect(source).toBeVisible()
    return source
  })
}
