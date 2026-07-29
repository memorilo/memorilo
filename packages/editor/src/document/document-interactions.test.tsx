import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import * as stylex from '@stylexjs/stylex'
import { render, waitFor } from '@testing-library/react'
import { page } from '@vitest/browser/context'
import { describe, expect, it } from 'vitest'
import { EditorModeHarness } from '../../test/browser/editor-mode-harness'
import { userEvent } from '../../test/browser/user-event'
import { Editor } from '../editor'
import { testLayoutStyles } from '../test/test-layout.stylex'

const adapters: EditorAdapters = {
  uploadImage: async () => 'memory://image',
  tagStorage: {
    search: async () => [],
    create: async tag => tag,
    update: async tag => tag,
  },
}

function documentBlock(id: string, body: NodeJSON, kind = 'outline', children: NodeJSON[] = []): NodeJSON {
  return {
    type: 'list',
    attrs: { blockId: id, checked: false, collapsed: false, kind, order: null },
    content: [body, ...children],
  }
}

function paragraph(text: string): NodeJSON {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function table(): NodeJSON {
  const cell = (text: string): NodeJSON => ({
    type: 'tableCell',
    attrs: {},
    content: [paragraph(text)],
  })
  return {
    type: 'table',
    content: [
      { type: 'tableRow', content: [cell('A1'), cell('A2')] },
      { type: 'tableRow', content: [cell('B1'), cell('B2')] },
    ],
  }
}

function marker(container: HTMLElement, id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-block-id="${id}"] > .list-marker`)
  if (!element)
    throw new Error(`Document block ${id} has no marker`)
  return element
}

function selectedCellText(): string | null {
  const focusNode = document.getSelection()?.focusNode
  if (!focusNode)
    return null
  const focusElement = focusNode instanceof Element ? focusNode : focusNode.parentElement
  return focusElement?.closest('td')?.textContent ?? null
}

function parentBlockId(container: HTMLElement, id: string): string | null {
  const block = container.querySelector<HTMLElement>(`[data-block-id="${id}"]`)
  if (!block)
    throw new Error(`Document block ${id} was not rendered`)
  return block.parentElement?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null
}

function selectedDomBlockId(): string | null {
  const focusNode = document.getSelection()?.focusNode
  if (!focusNode)
    return null
  const focusElement = focusNode.nodeType === Node.ELEMENT_NODE ? focusNode as Element : focusNode.parentElement
  return focusElement?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null
}

describe('document interactions', () => {
  it('keeps the slash menu working after switching back to Document mode', async () => {
    const rendered = render(
      <EditorModeHarness
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [documentBlock('before', paragraph('Before'))],
        }}
      />,
    )
    await rendered.findByText('Before')

    await userEvent.click(rendered.getByRole('button', { name: 'Outline mode' }))
    await rendered.findByText('Outline view ready.')
    await userEvent.click(rendered.getByRole('button', { name: 'Document mode' }))
    const before = await rendered.findByText('Before')
    const editor = rendered.getByRole('textbox', { name: 'Editor content' })
    await userEvent.click(before)
    await userEvent.keyboard('{End}{Enter}/')

    expect(editor).toHaveTextContent('Before/')
    await rendered.findByRole('option', { name: 'Text' })
    expect(rendered.getByRole('option', { name: 'Text' })).toBeVisible()
    expect(rendered.getByRole('option', { name: /^Quote/ })).toBeVisible()
  })

  it('moves the slash menu highlight with ArrowDown in Document mode', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [documentBlock('before', paragraph('Before'))],
        }}
      />,
    )
    await rendered.findByText('Before')
    await userEvent.click(page.getByText('Before', { exact: true }))
    await userEvent.keyboard('{End}{Enter}/')

    const textOption = await rendered.findByRole('option', { name: 'Text' })
    const headingOption = rendered.getByRole('option', { name: 'Heading 1 #' })
    await waitFor(() => expect(textOption).toHaveAttribute('data-highlighted'))

    await userEvent.keyboard('{ArrowDown}')

    await waitFor(() => {
      expect(textOption).not.toHaveAttribute('data-highlighted')
      expect(headingOption).toHaveAttribute('data-highlighted')
    })
  })

  it('creates a wrapped ordinary Document block from the block handle add control', async () => {
    const rendered = render(
      <div {...stylex.props(testLayoutStyles.blockHandleOffset)}>
        <Editor
          adapters={adapters}
          mode="document"
          initialContent={{
            type: 'doc',
            content: [
              documentBlock('Before', paragraph('Before')),
              documentBlock('After', paragraph('After')),
            ],
          }}
        />
      </div>,
    )
    await rendered.findByText('Before')

    await userEvent.hover(page.getByText('Before', { exact: true }))
    await userEvent.click(page.getByLabelText('Add block'))

    await waitFor(() => {
      const rootChildren = Array.from(rendered.getByRole('textbox', { name: 'Editor content' }).children)
      expect(rootChildren).toHaveLength(3)
      expect(rootChildren.every(element => element.matches('[data-list-kind="outline"][data-block-id]'))).toBe(true)
      expect(rootChildren.map(element => element.textContent)).toEqual(['Before', '', 'After'])
    })

    const ids = Array.from(rendered.container.querySelectorAll<HTMLElement>('[data-block-id]')).map((element) => {
      const id = element.dataset.blockId
      if (!id)
        throw new Error('A block-handle-created Document block is missing its stable id')
      return id
    })
    expect(new Set(ids).size).toBe(3)
    expect(selectedDomBlockId()).toBe(ids[1])
  })

  it('splits an ordinary block on Enter and keeps the split undoable', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('paragraph', {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Document paragraph' }],
            }),
          ],
        }}
      />,
    )
    await waitFor(() => expect(rendered.getByText('Document paragraph')).toBeInTheDocument())

    await userEvent.click(rendered.getByText('Document paragraph'))
    await userEvent.keyboard('{End}{Enter}')

    await waitFor(() => expect(rendered.container.querySelectorAll('[data-list-kind="outline"]')).toHaveLength(2))
    const ids = Array.from(rendered.container.querySelectorAll<HTMLElement>('[data-block-id]')).map((element) => {
      const id = element.dataset.blockId
      if (!id)
        throw new Error('A Document block lost its stable id')
      return id
    })
    expect(new Set(ids).size).toBe(2)

    await userEvent.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(rendered.container.querySelectorAll('[data-list-kind="outline"]')).toHaveLength(1))
    await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    await waitFor(() => expect(rendered.container.querySelectorAll('[data-list-kind="outline"]')).toHaveLength(2))
  })

  it('keeps repeated Enter inside wrapped ordinary Document blocks', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [documentBlock('paragraph', paragraph('Document paragraph'))],
        }}
      />,
    )
    await rendered.findByText('Document paragraph')

    await userEvent.click(rendered.getByText('Document paragraph'))
    await userEvent.keyboard('{End}{Enter}{Enter}{Enter}')

    await waitFor(() => {
      const rootChildren = Array.from(rendered.getByRole('textbox', { name: 'Editor content' }).children)
      expect(rootChildren).toHaveLength(4)
      expect(rootChildren.every(element => element.matches('[data-list-kind="outline"][data-block-id]'))).toBe(true)
      expect(rootChildren.map(element => element.textContent)).toEqual(['Document paragraph', '', '', ''])
    })

    const ids = Array.from(rendered.container.querySelectorAll<HTMLElement>('[data-block-id]')).map((element) => {
      const id = element.dataset.blockId
      if (!id)
        throw new Error('A repeated-Enter Document block is missing its stable id')
      return id
    })
    expect(new Set(ids).size).toBe(4)
    expect(selectedDomBlockId()).toBe(ids[3])
  })

  it('keeps Enter inside a code block instead of creating another Document block', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('code', {
              type: 'codeBlock',
              attrs: { language: 'javascript' },
              content: [{ type: 'text', text: 'const value = 1' }],
            }),
          ],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('pre[data-language]')).not.toBeNull())
    const code = rendered.container.querySelector<HTMLElement>('pre[data-language]')
    if (!code)
      throw new Error('Expected a rendered code block')

    await userEvent.click(code)
    await userEvent.keyboard('{End}{Enter}return value')

    await waitFor(() => expect(rendered.container.querySelector('pre[data-language]')?.textContent).toBe('const value = 1\nreturn value'))
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(1)
  })

  it('keeps the heading and creates a following paragraph when Enter is pressed at its end', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('heading', {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Document heading' }],
            }),
          ],
        }}
      />,
    )
    await waitFor(() => expect(rendered.getByRole('heading', { name: 'Document heading' })).toBeInTheDocument())

    await userEvent.click(rendered.getByRole('heading', { name: 'Document heading' }))
    await userEvent.keyboard('{End}{Enter}Following paragraph')

    expect(rendered.getByRole('heading', { name: 'Document heading' }).tagName).toBe('H2')
    await waitFor(() => expect(rendered.getByText('Following paragraph').tagName).toBe('P'))
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(2)
  })

  it('extends a quote with Enter and exits it from an empty quoted paragraph', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('quote', {
              type: 'blockquote',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Quoted line' }] },
              ],
            }),
          ],
        }}
      />,
    )
    await waitFor(() => expect(rendered.getByText('Quoted line')).toBeInTheDocument())

    await userEvent.click(rendered.getByText('Quoted line'))
    await userEvent.keyboard('{End}{Enter}Second quoted line')
    await waitFor(() => expect(rendered.container.querySelectorAll('blockquote p')).toHaveLength(2))

    await userEvent.keyboard('{End}{Enter}{Enter}After quote')
    await waitFor(() => expect(rendered.getByText('After quote')).toBeInTheDocument())
    expect(rendered.container.querySelectorAll('blockquote p')).toHaveLength(2)
    expect(rendered.getByText('After quote').closest('blockquote')).toBeNull()
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(1)
  })

  it.each([
    { kind: 'bullet', order: null, text: 'Bullet item' },
    { kind: 'ordered', order: 4, text: 'Ordered item' },
  ])('continues a semantic $kind list on Enter', async ({ kind, order, text }) => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            {
              ...documentBlock(kind, {
                type: 'paragraph',
                content: [{ type: 'text', text }],
              }, kind),
              attrs: { blockId: kind, checked: false, collapsed: false, kind, order },
            },
          ],
        }}
      />,
    )
    await waitFor(() => expect(rendered.getByText(text)).toBeInTheDocument())

    await userEvent.click(rendered.getByText(text))
    await userEvent.keyboard('{End}{Enter}Next item')

    await waitFor(() => expect(rendered.container.querySelectorAll(`[data-list-kind="${kind}"]`)).toHaveLength(2))
    expect(rendered.getByText('Next item').closest('[data-list-kind]')).toHaveAttribute('data-list-kind', kind)
    if (kind === 'ordered')
      expect(rendered.container.querySelector('[data-block-id="ordered"]')).toHaveAttribute('data-list-order', '4')
  })

  it.each([
    { kind: 'bullet', order: null, text: 'Bullet item' },
    { kind: 'ordered', order: 4, text: 'Ordered item' },
  ])('exits an empty semantic $kind item into a wrapped ordinary Document block', async ({ kind, order, text }) => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            {
              ...documentBlock(kind, paragraph(text), kind),
              attrs: { blockId: kind, checked: false, collapsed: false, kind, order },
            },
          ],
        }}
      />,
    )
    await rendered.findByText(text)

    await userEvent.click(rendered.getByText(text))
    await userEvent.keyboard('{End}{Enter}')
    await waitFor(() => expect(rendered.container.querySelectorAll(`[data-list-kind="${kind}"]`)).toHaveLength(2))
    const emptyItem = rendered.getByRole('textbox', { name: 'Editor content' }).lastElementChild
    const emptyItemId = emptyItem?.getAttribute('data-block-id')
    if (!emptyItemId)
      throw new Error(`The empty ${kind} item is missing its stable id before exiting the list`)

    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      const rootChildren = Array.from(rendered.getByRole('textbox', { name: 'Editor content' }).children)
      expect(rootChildren).toHaveLength(2)
      expect(rootChildren.map(element => element.getAttribute('data-list-kind'))).toEqual([kind, 'outline'])
      expect(rootChildren.map(element => element.textContent)).toEqual([text, ''])
      expect(rootChildren[1]).toHaveAttribute('data-block-id', emptyItemId)
    })
    expect(selectedDomBlockId()).toBe(emptyItemId)
  })

  it('keeps ordinary Document blocks flat when Tab or Shift-Tab is pressed', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('A', { type: 'paragraph', content: [{ type: 'text', text: 'First block' }] }),
            documentBlock('B', { type: 'paragraph', content: [{ type: 'text', text: 'Second block' }] }),
          ],
        }}
      />,
    )
    await waitFor(() => expect(rendered.getByText('Second block')).toBeInTheDocument())

    await userEvent.click(rendered.getByText('Second block'))
    await userEvent.keyboard('{Tab}{Tab}{Tab}')
    expect(parentBlockId(rendered.container, 'B')).toBeNull()
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(2)

    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(parentBlockId(rendered.container, 'B')).toBeNull()
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(2)
    expect(rendered.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the first ordinary Document block wrapped at its start on Backspace', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('A', paragraph('A')),
            documentBlock('B', paragraph('B')),
          ],
        }}
      />,
    )
    await rendered.findByText('A')

    await userEvent.click(rendered.getByText('A', { exact: true }))
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)
    await userEvent.keyboard('{Backspace}')

    await waitFor(() => {
      const rootChildren = Array.from(rendered.getByRole('textbox', { name: 'Editor content' }).children)
      expect(rootChildren).toHaveLength(2)
      expect(rootChildren.map(element => element.getAttribute('data-block-id'))).toEqual(['A', 'B'])
      expect(rootChildren.map(element => element.textContent)).toEqual(['A', 'B'])
      expect(rootChildren.every(element => element.matches('[data-list-kind="outline"]'))).toBe(true)
    })
    expect(selectedDomBlockId()).toBe('A')
  })

  it('merges an ordinary Document block into its predecessor on Backspace at its start', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('A', paragraph('A')),
            documentBlock('B', paragraph('B')),
          ],
        }}
      />,
    )
    await rendered.findByText('B')

    await userEvent.click(rendered.getByText('B', { exact: true }))
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)
    await userEvent.keyboard('{Backspace}')

    await waitFor(() => {
      const rootChildren = Array.from(rendered.getByRole('textbox', { name: 'Editor content' }).children)
      expect(rootChildren).toHaveLength(1)
      expect(rootChildren[0]).toHaveAttribute('data-block-id', 'A')
      expect(rootChildren[0]).toHaveAttribute('data-list-kind', 'outline')
      expect(rootChildren[0]).toHaveTextContent('AB')
      expect(rendered.container.querySelector('[data-block-id="B"]')).toBeNull()
    })
    expect(selectedDomBlockId()).toBe('A')
  })

  it('merges an ordinary paragraph into the preceding heading without leaving bare content', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('A', {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Heading' }],
            }),
            documentBlock('B', paragraph('Following paragraph')),
          ],
        }}
      />,
    )
    await rendered.findByText('Following paragraph')

    await userEvent.click(rendered.getByText('Following paragraph'))
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)
    await userEvent.keyboard('{Backspace}')

    expect(rendered.container.querySelector('[data-block-id="A"]')).toHaveTextContent('HeadingFollowing paragraph')
    expect(rendered.container.querySelector('[data-block-id="B"]')).toBeNull()
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(1)
    expect(rendered.container.querySelector('[data-editor-content] > p')).toBeNull()
  })

  it('turns a heading into a paragraph on Backspace while preserving its Document block id', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('A', {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Heading' }],
            }),
          ],
        }}
      />,
    )
    await rendered.findByRole('heading', { name: 'Heading' })

    await userEvent.click(rendered.getByRole('heading', { name: 'Heading' }))
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)
    await userEvent.keyboard('{Backspace}')

    expect(rendered.queryByRole('heading', { name: 'Heading' })).not.toBeInTheDocument()
    expect(rendered.container.querySelector('[data-block-id="A"] > .list-content > p')).toHaveTextContent('Heading')
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(1)
  })

  it.each([
    { kind: 'bullet', order: null },
    { kind: 'ordered', order: 4 },
  ])('turns a root $kind item into an ordinary Document block on Backspace without changing its id', async ({ kind, order }) => {
    const item = documentBlock('A', paragraph('List item'), kind)
    item.attrs = { ...item.attrs, order }
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{ type: 'doc', content: [item] }}
      />,
    )
    await rendered.findByText('List item')

    await userEvent.click(rendered.getByText('List item'))
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)
    await userEvent.keyboard('{Backspace}')

    expect(rendered.container.querySelector('[data-block-id="A"]')).toHaveAttribute('data-list-kind', 'outline')
    expect(rendered.container.querySelector('[data-block-id="A"]')).toHaveTextContent('List item')
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(1)
    expect(rendered.container.querySelector('[data-editor-content] > p')).toBeNull()
  })

  it.each([
    { kind: 'bullet', order: null },
    { kind: 'ordered', order: 4 },
  ])('merges a root $kind item into its preceding list item on Backspace', async ({ kind, order }) => {
    const first = documentBlock('A', paragraph('First item'), kind)
    const second = documentBlock('B', paragraph('Second item'), kind)
    first.attrs = { ...first.attrs, order }
    second.attrs = { ...second.attrs, order }
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{ type: 'doc', content: [first, second] }}
      />,
    )
    await rendered.findByText('Second item')

    await userEvent.click(rendered.getByText('Second item'))
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)
    await userEvent.keyboard('{Backspace}')

    expect(rendered.container.querySelector('[data-block-id="A"]')).toHaveTextContent('First itemSecond item')
    expect(rendered.container.querySelector('[data-block-id="A"]')).toHaveAttribute('data-list-kind', kind)
    expect(rendered.container.querySelector('[data-block-id="B"]')).toBeNull()
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(1)
  })

  it('outdents a nested semantic list item on Backspace without changing block ids', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('A', paragraph('Parent item'), 'bullet', [
              documentBlock('B', paragraph('Child item'), 'bullet'),
            ]),
          ],
        }}
      />,
    )
    await rendered.findByText('Child item')

    await userEvent.click(rendered.getByText('Child item'))
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)
    await userEvent.keyboard('{Backspace}')

    await waitFor(() => expect(parentBlockId(rendered.container, 'B')).toBeNull())
    expect(rendered.container.querySelector('[data-block-id="B"]')).toHaveAttribute('data-list-kind', 'bullet')
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(2)
  })

  it.each([
    { kind: 'bullet', order: null },
    { kind: 'ordered', order: 4 },
  ])('indents a semantic $kind list only beneath a real preceding item', async ({ kind, order }) => {
    const first = documentBlock('A', paragraph('First item'), kind)
    const second = documentBlock('B', paragraph('Second item'), kind)
    first.attrs = { ...first.attrs, order }
    second.attrs = { ...second.attrs, order }
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{ type: 'doc', content: [first, second] }}
      />,
    )
    await rendered.findByText('Second item')

    await userEvent.click(rendered.getByText('Second item'))
    await userEvent.keyboard('{Tab}')
    await waitFor(() => expect(parentBlockId(rendered.container, 'B')).toBe('A'))

    await userEvent.keyboard('{Tab}{Tab}')
    await waitFor(() => {
      expect(parentBlockId(rendered.container, 'B')).toBe('A')
      expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(2)
    })
    expect(rendered.container.querySelector('[data-block-id="B"]')).toHaveAttribute('data-list-kind', kind)
    if (kind === 'ordered')
      expect(rendered.container.querySelector('[data-block-id="B"]')).toHaveAttribute('data-list-order', '4')

    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await waitFor(() => expect(parentBlockId(rendered.container, 'B')).toBeNull())
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(2)
  })

  it('keeps task controls interactive in Document mode', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [{
            type: 'list',
            attrs: {
              blockId: 'Task',
              checked: false,
              collapsed: false,
              elapsedMs: 0,
              kind: 'task',
              order: null,
              startedAt: null,
              status: 'todo',
            },
            content: [paragraph('Task item')],
          }],
        }}
      />,
    )
    await rendered.findByRole('button', { name: 'Task status: todo' })

    await userEvent.click(page.getByRole('button', { name: 'Task status: todo' }))

    expect(await rendered.findByRole('button', { name: 'Task status: doing' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps toggle controls interactive in Document mode', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [documentBlock('Toggle', paragraph('Toggle item'), 'toggle', [documentBlock('Child', paragraph('Child item'))])],
        }}
      />,
    )
    await rendered.findByText('Child item')

    await userEvent.click(page.getByText('Toggle item', { exact: true }))
    await userEvent.click(marker(rendered.container, 'Toggle'))

    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="Toggle"]')).toHaveAttribute('data-list-collapsed'))
    expect(rendered.getByText('Child item')).not.toBeVisible()
  })

  it('navigates table cells with Tab and Shift-Tab without changing the Document tree', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode="document"
        initialContent={{
          type: 'doc',
          content: [documentBlock('Parent', paragraph('Parent'), 'outline', [documentBlock('Table', table())])],
        }}
      />,
    )
    await rendered.findByText('A1')
    await userEvent.click(page.getByText('A1', { exact: true }))

    await userEvent.keyboard('{Tab}')
    expect(selectedCellText()).toBe('A2')
    expect(parentBlockId(rendered.container, 'Table')).toBe('Parent')

    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(selectedCellText()).toBe('A1')
    expect(parentBlockId(rendered.container, 'Table')).toBe('Parent')

    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(selectedCellText()).toBe('A1')
    expect(parentBlockId(rendered.container, 'Table')).toBe('Parent')
  })
})
