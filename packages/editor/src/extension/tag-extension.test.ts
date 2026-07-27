import type { EditorTag, EditorTagStorage } from '../adapters/editor-adapters'
import { defineBasicExtension } from 'prosekit/basic'
import { union } from 'prosekit/core'
import { createTestEditor } from 'prosekit/core/test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TagRuntime } from '../tag/tag-runtime'
import { defineTag } from './tag-extension'

const mountedEditors: VoidFunction[] = []

function createStorage(overrides: Partial<EditorTagStorage> = {}): EditorTagStorage {
  return {
    search: async () => [],
    create: async tag => tag,
    update: async tag => tag,
    ...overrides,
  }
}

function setupExtension(storage: EditorTagStorage) {
  const runtime = new TagRuntime(storage)
  const extension = union(defineBasicExtension(), defineTag(runtime))
  const editor = createTestEditor({ extension })
  const element = document.body.appendChild(document.createElement('div'))
  editor.mount(element)
  mountedEditors.push(() => {
    editor.unmount()
    element.remove()
  })
  const { doc, paragraph } = editor.nodes
  editor.set(doc(paragraph('<a>')))
  return { editor, runtime }
}

function inputText(editor: ReturnType<typeof setupExtension>['editor'], text: string) {
  for (const character of text) {
    const { from, to } = editor.view.state.selection
    let handled = false
    editor.view.someProp('handleTextInput', (handler) => {
      const transaction = editor.view.state.tr.insertText(character, from, to)
      handled = handler(editor.view, from, to, character, () => transaction) === true
      return handled
    })
    if (!handled)
      editor.view.dispatch(editor.view.state.tr.insertText(character, from, to))
  }
}

function readTags(editor: ReturnType<typeof setupExtension>['editor']) {
  const tags: EditorTag[] = []
  editor.view.state.doc.descendants((node) => {
    if (node.type.name === 'tag')
      tags.push(node.attrs as EditorTag)
  })
  return tags
}

afterEach(() => {
  for (const unmount of mountedEditors)
    unmount()
  mountedEditors.length = 0
})

describe('tag input rule', () => {
  it('converts a typed new label and creates it once', () => {
    const create = vi.fn<EditorTagStorage['create']>(async tag => tag)
    const { editor } = setupExtension(createStorage({ create }))

    inputText(editor, '#novel ')

    const tags = readTags(editor)
    expect(tags).toEqual([{ id: expect.any(String), label: 'novel' }])
    expect(editor.view.state.doc.textContent).toBe('#novel ')
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(tags[0])
  })

  it('converts a typed existing label using its stored id without creating it', async () => {
    const existingTag = { id: 'tag-project', label: 'project' }
    const create = vi.fn<EditorTagStorage['create']>(async tag => tag)
    const { editor, runtime } = setupExtension(createStorage({
      search: async () => [existingTag],
      create,
    }))
    await runtime.search('project')

    inputText(editor, '#Project ')

    expect(readTags(editor)).toEqual([existingTag])
    expect(editor.view.state.doc.textContent).toBe('#project ')
    expect(create).not.toHaveBeenCalled()
  })

  it.each([
    '#_private ',
    '#bad! ',
    `#${'a'.repeat(65)} `,
  ])('keeps invalid input as text without creating a tag: %s', (input) => {
    const create = vi.fn<EditorTagStorage['create']>(async tag => tag)
    const { editor } = setupExtension(createStorage({ create }))

    inputText(editor, input)

    expect(readTags(editor)).toEqual([])
    expect(editor.view.state.doc.textContent).toBe(input)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('tag document parsing', () => {
  it('does not create a tag node from HTML without a stored id', () => {
    const { editor } = setupExtension(createStorage())

    editor.setContent('<p><span data-tag="project">#project</span></p>')

    expect(readTags(editor)).toEqual([])
    expect(editor.view.state.doc.textContent).toBe('#project')
  })
})
