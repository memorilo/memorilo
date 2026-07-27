import type { Editor } from 'prosekit/core'
import type { EditorTag, EditorTagStorage } from '../../adapters/editor-adapters'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { defineBasicExtension } from 'prosekit/basic'
import { union } from 'prosekit/core'
import { createTestEditor } from 'prosekit/core/test'
import { ProseKit } from 'prosekit/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { defineTag } from '../../extension/tag-extension'
import { TagRuntime } from '../../tag/tag-runtime'
import { defineTagView } from '../tag-view'
import TagMenu from './tag-menu'

const mountedEditors: VoidFunction[] = []

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function setupMenu(storage: EditorTagStorage) {
  const runtime = new TagRuntime(storage)
  const extension = union(defineBasicExtension(), defineTag(runtime), defineTagView(runtime))
  const editor = createTestEditor({ extension })
  const rendered = render(createElement(
    ProseKit,
    { editor: editor as unknown as Editor },
    createElement('div', null, createElement('div', { ref: editor.mount }), createElement(TagMenu, { runtime })),
  ))
  mountedEditors.push(() => {
    rendered.unmount()
    editor.unmount()
  })

  const { doc, paragraph } = editor.nodes
  act(() => editor.set(doc(paragraph('<a>'))))
  editor.view.focus()
  return { editor, rendered, runtime }
}

function inputText(editor: Awaited<ReturnType<typeof setupMenu>>['editor'], text: string) {
  for (const character of text) {
    act(() => {
      const { from, to } = editor.view.state.selection
      let handled = false
      editor.view.someProp('handleTextInput', (handler) => {
        const transaction = editor.view.state.tr.insertText(character, from, to)
        handled = handler(editor.view, from, to, character, () => transaction) === true
        return handled
      })
      if (!handled)
        editor.view.dispatch(editor.view.state.tr.insertText(character, from, to))
    })
  }
}

function pressEditorKey(editor: Awaited<ReturnType<typeof setupMenu>>['editor'], key: string) {
  act(() => {
    editor.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }))
  })
}

function readTags(editor: Awaited<ReturnType<typeof setupMenu>>['editor']) {
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

describe('tag autocomplete', () => {
  it('hides old candidates and creation while the current query is loading', async () => {
    const pendingSearch = deferred<readonly EditorTag[]>()
    const project = { id: 'tag-project', label: 'project' }
    const create = vi.fn<EditorTagStorage['create']>(async tag => tag)
    const search = vi.fn<EditorTagStorage['search']>(({ query }) => {
      if (query === 'p')
        return Promise.resolve([project])
      if (query === 'pr')
        return pendingSearch.promise
      return Promise.resolve([])
    })
    const storage: EditorTagStorage = {
      search,
      create,
      update: async tag => tag,
    }
    const { editor, rendered } = await setupMenu(storage)

    inputText(editor, '#p')
    await waitFor(() => expect(rendered.getByText('#project')).toBeInTheDocument())

    inputText(editor, 'r')

    expect(rendered.queryByText('#project')).toBeNull()
    expect(rendered.queryByText('Create #pr')).toBeNull()
    expect(rendered.getByText('Loading...')).toBeInTheDocument()
    pressEditorKey(editor, 'Enter')
    expect(readTags(editor)).toEqual([])
    expect(create).not.toHaveBeenCalled()

    await act(async () => pendingSearch.resolve([]))
  })

  it('shows a search error without offering to create an unverified label', async () => {
    const storage: EditorTagStorage = {
      search: async () => {
        throw new Error('Search unavailable')
      },
      create: async tag => tag,
      update: async tag => tag,
    }
    const { editor, rendered } = await setupMenu(storage)

    inputText(editor, '#idea')

    await waitFor(() => expect(rendered.getByText('Search unavailable')).toBeInTheDocument())
    expect(rendered.queryByText('Create #idea')).toBeNull()
  })

  it('inserts an existing async candidate with Enter without creating it', async () => {
    const project = { id: 'tag-project', label: 'project' }
    const create = vi.fn<EditorTagStorage['create']>(async tag => tag)
    const storage: EditorTagStorage = {
      search: async () => [project],
      create,
      update: async tag => tag,
    }
    const { editor, rendered } = await setupMenu(storage)

    inputText(editor, '#pro')
    await waitFor(() => expect(rendered.getByText('#project')).toBeInTheDocument())
    pressEditorKey(editor, 'Enter')

    await waitFor(() => expect(readTags(editor)).toEqual([project]))
    expect(editor.view.state.doc.textContent).toBe('#project ')
    expect(create).not.toHaveBeenCalled()
  })

  it('creates and inserts a new tag from the menu with Enter', async () => {
    const create = vi.fn<EditorTagStorage['create']>(async tag => tag)
    const storage: EditorTagStorage = {
      search: async () => [],
      create,
      update: async tag => tag,
    }
    const { editor, rendered } = await setupMenu(storage)

    inputText(editor, '#novel')
    await waitFor(() => expect(rendered.getByText('Create #novel')).toBeInTheDocument())
    pressEditorKey(editor, 'Enter')

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const createdTag = create.mock.calls[0]?.[0]
    expect(createdTag).toEqual({ id: expect.any(String), label: 'novel' })
    expect(readTags(editor)).toEqual([createdTag])
    expect(editor.view.state.doc.textContent).toBe('#novel ')
  })

  it('retries a failed menu creation and applies the canonical stored tag', async () => {
    const canonicalTag = { id: 'tag-canonical', label: 'Retry' }
    const create = vi.fn<EditorTagStorage['create']>()
      .mockRejectedValueOnce(new Error('Create failed'))
      .mockResolvedValueOnce(canonicalTag)
    const update = vi.fn<EditorTagStorage['update']>(async tag => tag)
    const storage: EditorTagStorage = {
      search: async () => [],
      create,
      update,
    }
    const { editor, rendered } = await setupMenu(storage)

    inputText(editor, '#retry')
    await waitFor(() => expect(rendered.getByText('Create #retry')).toBeInTheDocument())
    pressEditorKey(editor, 'Enter')

    const failedButton = await waitFor(() => {
      const element = editor.view.dom.querySelector<HTMLButtonElement>('button[aria-label="Edit tag retry, Not saved"]')
      expect(element).not.toBeNull()
      return element as HTMLButtonElement
    })
    fireEvent.click(failedButton)
    const input = await waitFor(() => {
      const element = editor.view.dom.querySelector<HTMLInputElement>('input[aria-label="Edit tag retry"]')
      expect(element).not.toBeNull()
      return element as HTMLInputElement
    })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(readTags(editor)).toEqual([canonicalTag]))
    expect(create).toHaveBeenCalledTimes(2)
    expect(update).not.toHaveBeenCalled()
  })

  it('ignores an obsolete search response that resolves after the current query', async () => {
    const oldSearch = deferred<readonly EditorTag[]>()
    const currentSearch = deferred<readonly EditorTag[]>()
    const storage: EditorTagStorage = {
      search: ({ query }) => {
        if (query === 'p')
          return oldSearch.promise
        if (query === 'pr')
          return currentSearch.promise
        return Promise.resolve([])
      },
      create: async tag => tag,
      update: async tag => tag,
    }
    const { editor, rendered } = await setupMenu(storage)

    inputText(editor, '#p')
    inputText(editor, 'r')
    await act(async () => currentSearch.resolve([{ id: 'tag-present', label: 'present' }]))
    await waitFor(() => expect(rendered.getByText('#present')).toBeInTheDocument())

    await act(async () => oldSearch.resolve([{ id: 'tag-past', label: 'project' }]))
    expect(rendered.queryByText('#project')).toBeNull()
    expect(rendered.getByText('#present')).toBeInTheDocument()
  })
})
