import type { Editor } from 'prosekit/core'
import type { EditorTagStorage } from '../../adapters/editor-adapters'
import type { TagAttrs } from '../../extension/tag-extension'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { defineBasicExtension } from 'prosekit/basic'
import { union } from 'prosekit/core'
import { createTestEditor } from 'prosekit/core/test'
import { NodeSelection, TextSelection } from 'prosekit/pm/state'
import { ProseKit } from 'prosekit/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { defineTag } from '../../extension/tag-extension'
import { TagRuntime } from '../../tag/tag-runtime'
import { defineTagView } from './index'

const tag = { id: 'tag-project', label: 'project' }
const mountedEditors: VoidFunction[] = []

function createTagStorage(update: EditorTagStorage['update'] = async updatedTag => updatedTag): EditorTagStorage {
  return {
    search: async () => [tag],
    create: async createdTag => createdTag,
    update,
  }
}

async function setupEditor(side: 'left' | 'right', storage = createTagStorage(), duplicate = false) {
  const runtime = new TagRuntime(storage)
  const extension = union(
    defineBasicExtension(),
    defineTag(runtime),
    defineTagView(runtime),
  )
  const editor = createTestEditor({ extension })
  const rendered = render(createElement(
    ProseKit,
    { editor: editor as unknown as Editor },
    createElement('div', { ref: editor.mount }),
  ))
  mountedEditors.push(() => {
    rendered.unmount()
    editor.unmount()
  })

  const { doc, paragraph, tag: tagNode } = editor.nodes
  act(() => {
    const content = duplicate
      ? paragraph('before<a>', tagNode(tag), ' middle ', tagNode(tag), 'after')
      : paragraph(
          side === 'left' ? 'before<a>' : 'before',
          tagNode(tag),
          side === 'right' ? '<a>after' : 'after',
        )
    editor.set(doc(content))
  })
  await waitFor(() => expect(editor.view.dom.querySelector('button[aria-label^="Edit tag project"]')).not.toBeNull())
  editor.view.focus()

  return editor
}

function readDocumentTags(editor: Awaited<ReturnType<typeof setupEditor>>) {
  const tags: TagAttrs[] = []
  editor.view.state.doc.descendants((node) => {
    if (node.type.name === 'tag')
      tags.push(node.attrs as TagAttrs)
  })
  return tags
}

function pressEditorArrow(editor: Awaited<ReturnType<typeof setupEditor>>, key: 'ArrowLeft' | 'ArrowRight') {
  act(() => {
    editor.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }))
  })
}

function pressInputArrow(input: HTMLInputElement, key: 'ArrowLeft' | 'ArrowRight') {
  const selectionStart = input.selectionStart
  const selectionEnd = input.selectionEnd
  if (selectionStart === null || selectionEnd === null)
    throw new Error('The tag input does not expose a text selection')

  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })
  fireEvent(input, event)
  if (event.defaultPrevented)
    return

  const offset = key === 'ArrowLeft'
    ? selectionStart === selectionEnd ? Math.max(0, selectionStart - 1) : selectionStart
    : selectionStart === selectionEnd ? Math.min(input.value.length, selectionEnd + 1) : selectionEnd
  input.setSelectionRange(offset, offset)
}

afterEach(() => {
  for (const unmount of mountedEditors)
    unmount()
  mountedEditors.length = 0
  vi.restoreAllMocks()
})

describe('tag keyboard navigation', () => {
  it('returns to the left text cursor when reversing after selecting from the left', async () => {
    const editor = await setupEditor('left')
    const originalPosition = editor.view.state.selection.from

    pressEditorArrow(editor, 'ArrowRight')
    expect(editor.view.state.selection).toBeInstanceOf(NodeSelection)

    pressEditorArrow(editor, 'ArrowLeft')

    expect(editor.view.state.selection).toBeInstanceOf(TextSelection)
    expect(editor.view.state.selection.empty).toBe(true)
    expect(editor.view.state.selection.from).toBe(originalPosition)
    expect(editor.view.dom.querySelector('input')).toBeNull()
  })

  it('moves from the left text cursor through selection and editing to the right text cursor', async () => {
    const editor = await setupEditor('left')

    expect(editor.view.state.selection).toBeInstanceOf(TextSelection)

    pressEditorArrow(editor, 'ArrowRight')

    const selectedTag = editor.view.state.selection
    expect(selectedTag).toBeInstanceOf(NodeSelection)
    expect((selectedTag as NodeSelection).node.type.name).toBe('tag')
    expect(editor.view.dom.querySelector('input')).toBeNull()

    pressEditorArrow(editor, 'ArrowRight')

    const input = await waitFor(() => {
      const element = editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]')
      expect(element).not.toBeNull()
      return element as HTMLInputElement
    })
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(0)

    for (let offset = 0; offset < input.value.length; offset++) {
      pressInputArrow(input, 'ArrowRight')
      expect(editor.view.dom.querySelector('input')).toBe(input)
    }
    pressInputArrow(input, 'ArrowRight')

    await waitFor(() => expect(editor.view.dom.querySelector('input')).toBeNull())
    expect(editor.view.state.selection).toBeInstanceOf(TextSelection)
    expect(editor.view.state.selection.empty).toBe(true)
    expect(editor.view.state.selection.from).toBe(selectedTag.to)
  })

  it('moves from the right text cursor through selection and editing to the left text cursor', async () => {
    const editor = await setupEditor('right')

    expect(editor.view.state.selection).toBeInstanceOf(TextSelection)

    pressEditorArrow(editor, 'ArrowLeft')

    const selectedTag = editor.view.state.selection
    expect(selectedTag).toBeInstanceOf(NodeSelection)
    expect((selectedTag as NodeSelection).node.type.name).toBe('tag')
    expect(editor.view.dom.querySelector('input')).toBeNull()

    pressEditorArrow(editor, 'ArrowLeft')

    const input = await waitFor(() => {
      const element = editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]')
      expect(element).not.toBeNull()
      return element as HTMLInputElement
    })
    expect(input.selectionStart).toBe(input.value.length)
    expect(input.selectionEnd).toBe(input.value.length)

    for (let offset = input.value.length; offset > 0; offset--) {
      pressInputArrow(input, 'ArrowLeft')
      expect(editor.view.dom.querySelector('input')).toBe(input)
    }
    pressInputArrow(input, 'ArrowLeft')

    await waitFor(() => expect(editor.view.dom.querySelector('input')).toBeNull())
    expect(editor.view.state.selection).toBeInstanceOf(TextSelection)
    expect(editor.view.state.selection.empty).toBe(true)
    expect(editor.view.state.selection.from).toBe(selectedTag.from)
  })

  it('returns to the right text cursor when reversing after selecting from the right', async () => {
    const editor = await setupEditor('right')
    const originalPosition = editor.view.state.selection.from

    pressEditorArrow(editor, 'ArrowLeft')
    expect(editor.view.state.selection).toBeInstanceOf(NodeSelection)

    pressEditorArrow(editor, 'ArrowRight')

    expect(editor.view.state.selection).toBeInstanceOf(TextSelection)
    expect(editor.view.state.selection.empty).toBe(true)
    expect(editor.view.state.selection.from).toBe(originalPosition)
    expect(editor.view.dom.querySelector('input')).toBeNull()
  })

  it('returns to the mapped left cursor after the selected tag moves in a transaction', async () => {
    const editor = await setupEditor('left')

    pressEditorArrow(editor, 'ArrowRight')
    const selectedPosition = editor.view.state.selection.from
    expect(editor.view.state.selection).toBeInstanceOf(NodeSelection)

    act(() => {
      editor.view.dispatch(editor.view.state.tr.insertText('x', 1))
    })
    expect(editor.view.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.view.state.selection.from).toBe(selectedPosition + 1)

    pressEditorArrow(editor, 'ArrowLeft')

    expect(editor.view.state.selection).toBeInstanceOf(TextSelection)
    expect(editor.view.state.selection.from).toBe(selectedPosition + 1)
  })

  it('enters editing when the selected tag moves immediately before the second arrow', async () => {
    const editor = await setupEditor('left')

    pressEditorArrow(editor, 'ArrowRight')
    expect(editor.view.state.selection).toBeInstanceOf(NodeSelection)

    act(() => {
      editor.view.dispatch(editor.view.state.tr.insertText('x', 1))
      editor.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'ArrowRight',
      }))
    })

    const input = await waitFor(() => editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]'))
    expect(input).not.toBeNull()
    expect(input?.selectionStart).toBe(0)
    expect(input?.selectionEnd).toBe(0)
  })

  it('keeps editing when leftward movement starts inside text or with a range selected', async () => {
    const editor = await setupEditor('left')

    pressEditorArrow(editor, 'ArrowRight')
    pressEditorArrow(editor, 'ArrowRight')
    const input = await waitFor(() => editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]'))
    expect(input).not.toBeNull()

    act(() => input?.setSelectionRange(2, 2))
    fireEvent.keyDown(input as HTMLInputElement, { key: 'ArrowLeft' })
    expect(editor.view.dom.querySelector('input')).toBe(input)

    act(() => input?.setSelectionRange(0, 2))
    fireEvent.keyDown(input as HTMLInputElement, { key: 'ArrowLeft' })
    expect(editor.view.dom.querySelector('input')).toBe(input)
  })

  it('keeps editing when rightward movement starts inside text or with a range selected', async () => {
    const editor = await setupEditor('right')

    pressEditorArrow(editor, 'ArrowLeft')
    pressEditorArrow(editor, 'ArrowLeft')
    const input = await waitFor(() => editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]'))
    expect(input).not.toBeNull()

    act(() => input?.setSelectionRange(input.value.length - 2, input.value.length - 2))
    fireEvent.keyDown(input as HTMLInputElement, { key: 'ArrowRight' })
    expect(editor.view.dom.querySelector('input')).toBe(input)

    act(() => input?.setSelectionRange(input.value.length - 2, input.value.length))
    fireEvent.keyDown(input as HTMLInputElement, { key: 'ArrowRight' })
    expect(editor.view.dom.querySelector('input')).toBe(input)
  })
})

describe('tag editing', () => {
  it('cancels a clicked edit with Escape without changing or saving the tag', async () => {
    const update = vi.fn<EditorTagStorage['update']>(async updatedTag => updatedTag)
    const editor = await setupEditor('left', createTagStorage(update))
    const button = editor.view.dom.querySelector<HTMLButtonElement>('button[aria-label^="Edit tag project"]')
    expect(button).not.toBeNull()

    fireEvent.click(button as HTMLButtonElement)
    const input = await waitFor(() => {
      const element = editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]')
      expect(element).not.toBeNull()
      return element as HTMLInputElement
    })

    fireEvent.change(input, { target: { value: 'changed' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => expect(editor.view.dom.querySelector('input')).toBeNull())
    expect(editor.view.state.doc.textBetween(0, editor.view.state.doc.content.size, '')).toContain('#project')
    expect(update).not.toHaveBeenCalled()
  })

  it('saves a clicked edit once with Enter and updates the document label', async () => {
    const update = vi.fn<EditorTagStorage['update']>(async updatedTag => updatedTag)
    const editor = await setupEditor('left', createTagStorage(update))
    const button = editor.view.dom.querySelector<HTMLButtonElement>('button[aria-label^="Edit tag project"]')
    expect(button).not.toBeNull()

    fireEvent.click(button as HTMLButtonElement)
    const input = await waitFor(() => editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]'))
    expect(input).not.toBeNull()
    fireEvent.change(input as HTMLInputElement, { target: { value: 'renamed' } })
    fireEvent.keyDown(input as HTMLInputElement, { key: 'Enter' })

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith({ id: tag.id, label: 'renamed' })
    expect(editor.view.state.doc.textBetween(0, editor.view.state.doc.content.size, '')).toContain('#renamed')
  })

  it('saves a clicked edit once when the input loses focus', async () => {
    const update = vi.fn<EditorTagStorage['update']>(async updatedTag => updatedTag)
    const editor = await setupEditor('left', createTagStorage(update))
    const button = editor.view.dom.querySelector<HTMLButtonElement>('button[aria-label^="Edit tag project"]')
    expect(button).not.toBeNull()

    fireEvent.click(button as HTMLButtonElement)
    const input = await waitFor(() => editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]'))
    expect(input).not.toBeNull()
    fireEvent.change(input as HTMLInputElement, { target: { value: 'blurred' } })
    const outsideButton = document.body.appendChild(document.createElement('button'))
    act(() => outsideButton.focus())

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith({ id: tag.id, label: 'blurred' })
    expect(editor.view.state.doc.textBetween(0, editor.view.state.doc.content.size, '')).toContain('#blurred')
    expect(document.activeElement).toBe(outsideButton)
    outsideButton.remove()
  })

  it('keeps an invalid edit open without changing or saving the tag', async () => {
    const update = vi.fn<EditorTagStorage['update']>(async updatedTag => updatedTag)
    const editor = await setupEditor('left', createTagStorage(update))
    const button = editor.view.dom.querySelector<HTMLButtonElement>('button[aria-label^="Edit tag project"]')
    expect(button).not.toBeNull()

    fireEvent.click(button as HTMLButtonElement)
    const input = await waitFor(() => editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]'))
    expect(input).not.toBeNull()
    fireEvent.change(input as HTMLInputElement, { target: { value: 'bad!' } })
    fireEvent.keyDown(input as HTMLInputElement, { key: 'Enter' })

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(editor.view.dom.querySelector('input')).toBe(input)
    expect(readDocumentTags(editor)).toEqual([tag])
    expect(update).not.toHaveBeenCalled()
  })

  it('updates every document tag with the same id after editing one of them', async () => {
    const update = vi.fn<EditorTagStorage['update']>(async updatedTag => updatedTag)
    const editor = await setupEditor('left', createTagStorage(update), true)
    const buttons = editor.view.dom.querySelectorAll<HTMLButtonElement>('button[aria-label^="Edit tag project"]')
    expect(buttons).toHaveLength(2)

    fireEvent.click(buttons[0] as HTMLButtonElement)
    const input = await waitFor(() => editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]'))
    expect(input).not.toBeNull()
    fireEvent.change(input as HTMLInputElement, { target: { value: 'shared' } })
    fireEvent.keyDown(input as HTMLInputElement, { key: 'Enter' })

    await waitFor(() => expect(readDocumentTags(editor)).toEqual([
      { id: tag.id, label: 'shared' },
      { id: tag.id, label: 'shared' },
    ]))
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('applies the canonical id and label returned by storage to every matching tag', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const canonicalTag = { id: 'tag-canonical', label: 'Canonical' }
    const update = vi.fn<EditorTagStorage['update']>(async () => canonicalTag)
    const editor = await setupEditor('left', createTagStorage(update), true)
    const button = editor.view.dom.querySelector<HTMLButtonElement>('button[aria-label^="Edit tag project"]')
    expect(button).not.toBeNull()

    fireEvent.click(button as HTMLButtonElement)
    const input = await waitFor(() => editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]'))
    expect(input).not.toBeNull()
    fireEvent.change(input as HTMLInputElement, { target: { value: 'renamed' } })
    fireEvent.keyDown(input as HTMLInputElement, { key: 'Enter' })

    await waitFor(() => expect(readDocumentTags(editor)).toEqual([canonicalTag, canonicalTag]))
    expect(update).toHaveBeenCalledWith({ id: tag.id, label: 'renamed' })
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('flushSync')
  })

  it('retries a failed update when the user confirms the unchanged optimistic label', async () => {
    const update = vi.fn<EditorTagStorage['update']>()
      .mockRejectedValueOnce(new Error('Update failed'))
      .mockImplementationOnce(async updatedTag => updatedTag)
    const editor = await setupEditor('left', createTagStorage(update))
    const button = editor.view.dom.querySelector<HTMLButtonElement>('button[aria-label^="Edit tag project"]')
    expect(button).not.toBeNull()

    fireEvent.click(button as HTMLButtonElement)
    const firstInput = await waitFor(() => editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag project"]'))
    expect(firstInput).not.toBeNull()
    fireEvent.change(firstInput as HTMLInputElement, { target: { value: 'retry' } })
    fireEvent.keyDown(firstInput as HTMLInputElement, { key: 'Enter' })

    const failedButton = await waitFor(() => {
      const element = editor.view.dom.querySelector<HTMLButtonElement>('button[aria-label="Edit tag retry, Not saved"]')
      expect(element).not.toBeNull()
      return element as HTMLButtonElement
    })
    fireEvent.click(failedButton)
    const retryInput = await waitFor(() => {
      const element = editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag retry"]')
      expect(element).not.toBeNull()
      return element as HTMLInputElement
    })
    expect(retryInput.value).toBe('retry')
    fireEvent.keyDown(retryInput, { key: 'Enter' })

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(update).toHaveBeenNthCalledWith(1, { id: tag.id, label: 'retry' })
    expect(update).toHaveBeenNthCalledWith(2, { id: tag.id, label: 'retry' })
  })
})
