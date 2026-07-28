import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import { render, waitFor } from '@testing-library/react'
import { page } from '@vitest/browser/context'
import { describe, expect, it, vi } from 'vitest'
import { userEvent } from '../../test/browser/user-event'

import { Editor } from '../editor'

const adapters: EditorAdapters = {
  uploadImage: async () => 'memory://image',
  tagStorage: {
    search: async () => [],
    create: async tag => tag,
    update: async tag => tag,
  },
}

function block(id: string, children: NodeJSON[] = [], kind = 'outline'): NodeJSON {
  return {
    type: 'list',
    attrs: { blockId: id, checked: false, collapsed: false, kind, order: null },
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: id }] },
      ...children,
    ],
  }
}

function emptyBlock(id: string, children: NodeJSON[] = []): NodeJSON {
  return {
    type: 'list',
    attrs: { blockId: id, checked: false, collapsed: false, kind: 'outline', order: null },
    content: [
      { type: 'paragraph' },
      ...children,
    ],
  }
}

function blockWithBody(id: string, body: NodeJSON, children: NodeJSON[] = [], kind = 'outline'): NodeJSON {
  return {
    type: 'list',
    attrs: { blockId: id, checked: false, collapsed: false, kind, order: null },
    content: [body, ...children],
  }
}

function outlineDocument(): NodeJSON {
  return {
    type: 'doc',
    content: [
      block('P', [block('A'), block('B'), block('C'), block('D'), block('E')]),
      block('Q'),
    ],
  }
}

function blockElement(container: HTMLElement, id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-block-id="${id}"]`)
  if (!element)
    throw new Error(`Block ${id} was not rendered`)
  return element
}

function marker(container: HTMLElement, id: string): HTMLElement {
  const element = blockElement(container, id).querySelector<HTMLElement>(':scope > .list-marker')
  if (!element)
    throw new Error(`Block ${id} has no marker`)
  return element
}

function paragraph(container: HTMLElement, id: string): HTMLElement {
  const element = blockElement(container, id).querySelector<HTMLElement>('p')
  if (!element)
    throw new Error(`Block ${id} has no paragraph`)
  return element
}

function selectedIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-outline-selected]'))
    .map((element) => {
      const id = element.dataset.blockId
      if (!id)
        throw new Error('Selected outline block is missing its blockId')
      return id
    })
}

function parentBlockId(container: HTMLElement, id: string): string | null {
  return blockElement(container, id).parentElement?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null
}

function outlineDepth(container: HTMLElement, id: string): number {
  let depth = 0
  let ancestor = blockElement(container, id).parentElement?.closest<HTMLElement>('.prosemirror-flat-list') ?? null
  while (ancestor) {
    depth += 1
    ancestor = ancestor.parentElement?.closest<HTMLElement>('.prosemirror-flat-list') ?? null
  }
  return depth
}

function selectedDomBlockId(): string | null {
  const focusNode = document.getSelection()?.focusNode
  if (!focusNode)
    return null
  const focusElement = focusNode.nodeType === Node.ELEMENT_NODE ? focusNode as Element : focusNode.parentElement
  return focusElement?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null
}

function table(): NodeJSON {
  const cell = (text: string): NodeJSON => ({
    type: 'tableCell',
    attrs: {},
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })
  return {
    type: 'table',
    content: [
      { type: 'tableRow', content: [cell('A1'), cell('A2')] },
      { type: 'tableRow', content: [cell('B1'), cell('B2')] },
    ],
  }
}

function selectedCellText(): string | null {
  const focusNode = document.getSelection()?.focusNode
  if (!focusNode)
    return null
  const focusElement = focusNode instanceof Element ? focusNode : focusNode.parentElement
  return focusElement?.closest('td')?.textContent ?? null
}

describe('outline interactions', () => {
  it('keeps the slash menu working after switching to Outline mode', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{ type: 'doc', content: [block('Before')] }}
      />,
    )
    await rendered.findByText('Before')

    await userEvent.click(rendered.getByRole('button', { name: 'Outline mode' }))
    await rendered.findByText('Outline view ready.')
    const before = rendered.getByText('Before')
    const editor = rendered.getByRole('textbox', { name: 'Editor content' })
    await userEvent.click(before)
    await userEvent.keyboard('{End}{Enter}/')

    expect(editor).toHaveTextContent('Before/')
    await rendered.findByRole('option', { name: 'Text' })
    expect(rendered.getByRole('option', { name: 'Text' })).toBeVisible()
    expect(rendered.getByRole('option', { name: /^Quote/ })).toBeVisible()
  })

  it('creates a top-level Outline sibling from the block handle add control', async () => {
    const rendered = render(
      <div style={{ marginLeft: 100 }}>
        <Editor
          adapters={adapters}
          defaultMode="outline"
          initialContent={{ type: 'doc', content: [block('Before'), block('After')] }}
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
        throw new Error('A block-handle-created Outline item is missing its stable id')
      return id
    })
    expect(new Set(ids).size).toBe(3)
    expect(selectedDomBlockId()).toBe(ids[1])
  })

  it('keeps creating top-level Outline siblings when Enter is repeated on empty items', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{ type: 'doc', content: [block('Before'), block('After')] }}
      />,
    )
    await rendered.findByText('Before')

    await userEvent.click(rendered.getByText('Before', { exact: true }))
    await userEvent.keyboard('{End}{Enter}{Enter}{Enter}')

    await waitFor(() => {
      const rootChildren = Array.from(rendered.getByRole('textbox', { name: 'Editor content' }).children)
      expect(rootChildren).toHaveLength(5)
      expect(rootChildren.every(element => element.matches('[data-list-kind="outline"][data-block-id]'))).toBe(true)
      expect(rootChildren.map(element => element.textContent)).toEqual(['Before', '', '', '', 'After'])
    })

    const ids = Array.from(rendered.container.querySelectorAll<HTMLElement>('[data-block-id]')).map((element) => {
      const id = element.dataset.blockId
      if (!id)
        throw new Error('An Enter-created Outline item is missing its stable id')
      return id
    })
    expect(new Set(ids).size).toBe(5)
    expect(selectedDomBlockId()).toBe(ids[3])
  })

  it('keeps Enter inside a code block instead of creating another Outline item', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{
          type: 'doc',
          content: [
            blockWithBody('Code', {
              type: 'codeBlock',
              attrs: { language: 'javascript' },
              content: [{ type: 'text', text: 'const branch = true' }],
            }),
          ],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('pre[data-language]')).not.toBeNull())
    const code = rendered.container.querySelector<HTMLElement>('pre[data-language]')
    if (!code)
      throw new Error('Expected a rendered Outline code block')

    await userEvent.click(code)
    await userEvent.keyboard('{End}{Enter}return branch')

    await waitFor(() => expect(rendered.container.querySelector('pre[data-language]')?.textContent).toBe('const branch = true\nreturn branch'))
    expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(1)
  })

  it('outdents a trailing nested empty branch on Enter like Logseq', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{
          type: 'doc',
          content: [block('Root', [emptyBlock('Empty', [block('Child')])])],
        }}
      />,
    )
    await rendered.findByText('Child')

    await userEvent.click(paragraph(rendered.container, 'Empty'))
    await userEvent.keyboard('{Enter}')

    await waitFor(() => {
      expect(parentBlockId(rendered.container, 'Empty')).toBeNull()
      expect(parentBlockId(rendered.container, 'Child')).toBe('Empty')
      expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(3)
    })
  })

  it('keeps an empty branch intact and editable through repeated Enter and Tab operations', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{ type: 'doc', content: [block('Before'), emptyBlock('Branch', [block('Child')])] }}
      />,
    )
    await waitFor(() => expect(blockElement(rendered.container, 'Child')).toBeInTheDocument())

    await userEvent.click(paragraph(rendered.container, 'Branch'))
    await userEvent.keyboard('{Enter}{Tab}{Enter}{Tab}')
    await userEvent.keyboard('Still editing')

    expect(rendered.getByRole('textbox', { name: 'Editor content' })).toBeInTheDocument()
    expect(rendered.getByText('Still editing')).toBeInTheDocument()
    expect(parentBlockId(rendered.container, 'Child')).toBe('Branch')
    const ids = Array.from(rendered.container.querySelectorAll<HTMLElement>('[data-block-id]')).map((element) => {
      const id = element.dataset.blockId
      if (!id)
        throw new Error('An Outline block lost its stable block id')
      return id
    })
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('indents a new sibling with Tab and outdents the current item with Shift-Tab', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{ type: 'doc', content: [block('Parent')] }}
      />,
    )
    await waitFor(() => expect(rendered.getByText('Parent')).toBeInTheDocument())

    await userEvent.click(rendered.getByText('Parent'))
    await userEvent.keyboard('{End}{Enter}New child')
    await waitFor(() => expect(rendered.getByText('New child')).toBeInTheDocument())
    const child = rendered.getByText('New child').closest<HTMLElement>('[data-block-id]')
    const childId = child?.dataset.blockId
    if (!childId)
      throw new Error('The new Outline item is missing its stable id')

    await userEvent.keyboard('{Tab}')
    await waitFor(() => expect(parentBlockId(rendered.container, childId)).toBe('Parent'))

    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await waitFor(() => expect(parentBlockId(rendered.container, childId)).toBeNull())
  })

  it('limits repeated Tab presses on a new item to one Logseq-style indent', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{ type: 'doc', content: [block('Parent')] }}
      />,
    )
    await rendered.findByText('Parent')

    await userEvent.click(rendered.getByText('Parent'))
    await userEvent.keyboard('{End}{Enter}')
    await userEvent.keyboard('{Tab}{Tab}{Tab}')
    await userEvent.keyboard('Child')
    const childText = await rendered.findByText('Child')
    const child = childText.closest<HTMLElement>('[data-block-id]')
    const childId = child?.dataset.blockId
    if (!childId)
      throw new Error('The repeatedly indented Outline item is missing its stable id')

    await waitFor(() => {
      expect(parentBlockId(rendered.container, childId)).toBe('Parent')
      expect(outlineDepth(rendered.container, childId)).toBe(1)
      expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(2)
    })
  })

  it('undoes and redoes empty-branch Enter as one structural edit', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{ type: 'doc', content: [block('Before'), emptyBlock('Branch', [block('Child')])] }}
      />,
    )
    await waitFor(() => expect(blockElement(rendered.container, 'Child')).toBeInTheDocument())

    await userEvent.click(paragraph(rendered.container, 'Branch'))
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(4))
    expect(parentBlockId(rendered.container, 'Child')).toBe('Branch')

    await userEvent.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(3))
    expect(parentBlockId(rendered.container, 'Child')).toBe('Branch')

    await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    await waitFor(() => expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(4))
    expect(parentBlockId(rendered.container, 'Child')).toBe('Branch')
  })

  it.each([
    { kind: 'bullet', order: null, text: 'Outline bullet' },
    { kind: 'ordered', order: 6, text: 'Outline ordered' },
  ])('continues a semantic $kind list on Enter in Outline mode', async ({ kind, order, text }) => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{
          type: 'doc',
          content: [
            {
              type: 'list',
              attrs: { blockId: kind, checked: false, collapsed: false, kind, order },
              content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
            },
          ],
        }}
      />,
    )
    await waitFor(() => expect(rendered.getByText(text)).toBeInTheDocument())

    await userEvent.click(rendered.getByText(text))
    await userEvent.keyboard('{End}{Enter}Next semantic item')

    await waitFor(() => expect(rendered.container.querySelectorAll(`[data-list-kind="${kind}"]`)).toHaveLength(2))
    expect(rendered.getByText('Next semantic item').closest('[data-list-kind]')).toHaveAttribute('data-list-kind', kind)
    if (kind === 'ordered')
      expect(rendered.container.querySelector('[data-block-id="ordered"]')).toHaveAttribute('data-list-order', '6')
  })

  it('keeps the first top-level Outline item wrapped at its start on Backspace', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{ type: 'doc', content: [block('A'), block('B')] }}
      />,
    )
    await rendered.findByText('A')

    await userEvent.click(paragraph(rendered.container, 'A'))
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

  it('merges a top-level Outline item into its predecessor on Backspace at its start', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{ type: 'doc', content: [block('A'), block('B')] }}
      />,
    )
    await rendered.findByText('B')

    await userEvent.click(paragraph(rendered.container, 'B'))
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

  it('removes an empty leaf with Backspace and keeps the previous item intact', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{ type: 'doc', content: [block('A'), emptyBlock('B')] }}
      />,
    )
    await waitFor(() => expect(blockElement(rendered.container, 'B')).toBeInTheDocument())

    await userEvent.click(paragraph(rendered.container, 'B'))
    await userEvent.keyboard('{Backspace}')

    await waitFor(() => expect(rendered.container.querySelectorAll('[data-block-id]')).toHaveLength(1))
    expect(rendered.container.querySelector('[data-block-id="A"]')).toHaveTextContent('A')
    expect(rendered.container.querySelector('[data-block-id="B"]')).toBeNull()
  })

  it('supports non-contiguous and continuous block selections as local view state', async () => {
    const rendered = render(<Editor adapters={adapters} defaultMode="outline" initialContent={outlineDocument()} />)
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="E"]')).not.toBeNull())

    await userEvent.click(marker(rendered.container, 'B'), { modifiers: ['Meta'] })
    await userEvent.click(marker(rendered.container, 'D'), { modifiers: ['Meta'] })
    expect(selectedIds(rendered.container)).toEqual(['B', 'D'])

    await userEvent.click(marker(rendered.container, 'B'), { modifiers: ['Meta'] })
    await userEvent.click(marker(rendered.container, 'E'), { modifiers: ['Shift'] })
    expect(selectedIds(rendered.container)).toEqual(['B', 'C', 'D', 'E'])

    await userEvent.click(rendered.getByRole('button', { name: 'Document mode' }))
    await userEvent.click(rendered.getByRole('button', { name: 'Outline mode' }))
    await waitFor(() => expect(selectedIds(rendered.container)).toEqual(['B', 'C', 'D', 'E']))
  })

  it('focuses by path without replacing the document and provides a way back', async () => {
    const onDocumentChange = vi.fn()
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={outlineDocument()}
        outline={{ defaultFocus: { path: [0, 1] } }}
        onDocumentChange={onDocumentChange}
      />,
    )
    await waitFor(() => expect(blockElement(rendered.container, 'B')).toHaveAttribute('data-outline-focus-root'))

    expect(blockElement(rendered.container, 'A')).toHaveAttribute('hidden')
    expect(blockElement(rendered.container, 'C')).toHaveAttribute('hidden')
    expect(blockElement(rendered.container, 'Q')).toHaveAttribute('hidden')
    expect(rendered.getByRole('button', { name: 'Show all blocks' })).toBeInTheDocument()
    expect(onDocumentChange).not.toHaveBeenCalled()

    await userEvent.click(rendered.getByRole('button', { name: 'Show all blocks' }))
    await waitFor(() => expect(blockElement(rendered.container, 'A')).not.toHaveAttribute('hidden'))
    expect(blockElement(rendered.container, 'Q')).not.toHaveAttribute('hidden')
    expect(onDocumentChange).not.toHaveBeenCalled()

    await userEvent.click(marker(rendered.container, 'D'))
    await waitFor(() => expect(blockElement(rendered.container, 'D')).toHaveAttribute('data-outline-focus-root'))
    expect(blockElement(rendered.container, 'B')).toHaveAttribute('hidden')
  })

  it('accepts a controlled Focus target by block id', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={outlineDocument()}
        outline={{ focus: { blockId: 'D' } }}
      />,
    )

    await waitFor(() => expect(blockElement(rendered.container, 'D')).toHaveAttribute('data-outline-focus-root'))
    expect(blockElement(rendered.container, 'B')).toHaveAttribute('hidden')
  })

  it('keeps collapse state local and restores it after switching modes', async () => {
    const onDocumentChange = vi.fn()
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={outlineDocument()}
        onDocumentChange={onDocumentChange}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="P"]')).not.toBeNull())

    await userEvent.click(marker(rendered.container, 'P'), { modifiers: ['Alt'] })
    await waitFor(() => expect(blockElement(rendered.container, 'P')).toHaveAttribute('data-outline-view-collapsed'))
    expect(blockElement(rendered.container, 'A')).not.toBeVisible()
    expect(onDocumentChange).not.toHaveBeenCalled()

    await userEvent.click(rendered.getByRole('button', { name: 'Document mode' }))
    await waitFor(() => expect(blockElement(rendered.container, 'A')).toBeVisible())
    await userEvent.click(rendered.getByRole('button', { name: 'Outline mode' }))
    await waitFor(() => expect(blockElement(rendered.container, 'P')).toHaveAttribute('data-outline-view-collapsed'))
    expect(blockElement(rendered.container, 'A')).not.toBeVisible()
    expect(onDocumentChange).not.toHaveBeenCalled()
  })

  it('rejects a non-contiguous Traditional Outdent and applies Logical Outdent as one undoable transaction', async () => {
    const onDocumentChange = vi.fn()
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={outlineDocument()}
        onDocumentChange={onDocumentChange}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="D"]')).not.toBeNull())

    await userEvent.click(marker(rendered.container, 'B'), { modifiers: ['Meta'] })
    await userEvent.click(marker(rendered.container, 'D'), { modifiers: ['Meta'] })
    await userEvent.selectOptions(rendered.getByRole('combobox', { name: 'Outdent behavior' }), 'traditional')

    const outdent = rendered.getByRole('button', { name: 'Outdent selected blocks' })
    expect(outdent).toBeDisabled()
    expect(rendered.getByRole('status')).toHaveTextContent(
      'Traditional outdent requires consecutive blocks under the same parent. Adjust the selection or switch to Logical outdent.',
    )
    expect(onDocumentChange).not.toHaveBeenCalled()

    await userEvent.selectOptions(rendered.getByRole('combobox', { name: 'Outdent behavior' }), 'logical')
    expect(outdent).toBeEnabled()
    await userEvent.click(outdent)

    await waitFor(() => expect(parentBlockId(rendered.container, 'B')).toBeNull())
    expect(parentBlockId(rendered.container, 'D')).toBeNull()
    expect(parentBlockId(rendered.container, 'C')).toBe('P')
    expect(selectedIds(rendered.container)).toEqual(['B', 'D'])
    expect(onDocumentChange).toHaveBeenCalledTimes(1)

    await userEvent.click(paragraph(rendered.container, 'B'))
    await userEvent.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(parentBlockId(rendered.container, 'B')).toBe('P'))
    expect(parentBlockId(rendered.container, 'D')).toBe('P')

    await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    await waitFor(() => expect(parentBlockId(rendered.container, 'B')).toBeNull())
    expect(parentBlockId(rendered.container, 'D')).toBeNull()
  })

  it('applies Traditional Outdent to one contiguous sibling range', async () => {
    const onDocumentChange = vi.fn()
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={outlineDocument()}
        onDocumentChange={onDocumentChange}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="C"]')).not.toBeNull())

    await userEvent.click(marker(rendered.container, 'B'), { modifiers: ['Meta'] })
    await userEvent.click(marker(rendered.container, 'C'), { modifiers: ['Shift'] })
    await userEvent.selectOptions(rendered.getByRole('combobox', { name: 'Outdent behavior' }), 'traditional')
    await userEvent.click(rendered.getByRole('button', { name: 'Outdent selected blocks' }))

    await waitFor(() => expect(parentBlockId(rendered.container, 'B')).toBeNull())
    expect(parentBlockId(rendered.container, 'C')).toBeNull()
    expect(parentBlockId(rendered.container, 'D')).toBe('C')
    expect(parentBlockId(rendered.container, 'E')).toBe('C')
    expect(onDocumentChange).toHaveBeenCalledTimes(1)

    await userEvent.click(paragraph(rendered.container, 'B'))
    await userEvent.keyboard('{Meta>}z{/Meta}')
    await waitFor(() => expect(parentBlockId(rendered.container, 'B')).toBe('P'))
    expect(parentBlockId(rendered.container, 'C')).toBe('P')
    expect(parentBlockId(rendered.container, 'D')).toBe('P')
    expect(parentBlockId(rendered.container, 'E')).toBe('P')
  })

  it('uses the selected blocks for Logical Outdent from Shift-Tab', async () => {
    const rendered = render(<Editor adapters={adapters} defaultMode="outline" initialContent={outlineDocument()} />)
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="D"]')).not.toBeNull())

    await userEvent.click(marker(rendered.container, 'B'), { modifiers: ['Meta'] })
    await userEvent.click(marker(rendered.container, 'D'), { modifiers: ['Meta'] })
    await userEvent.click(paragraph(rendered.container, 'B'))
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')

    await waitFor(() => expect(parentBlockId(rendered.container, 'B')).toBeNull())
    expect(parentBlockId(rendered.container, 'D')).toBeNull()
    expect(parentBlockId(rendered.container, 'C')).toBe('P')
  })

  it('keeps the active block and page viewport stable when Shift-Tab changes its level', async () => {
    const precedingBlocks = Array.from({ length: 20 }, (_, index) => block(`Before ${index}`))
    const followingBlocks = Array.from({ length: 30 }, (_, index) => block(`After ${index}`))
    const rendered = render(
      <div style={{ display: 'flex', height: 360 }}>
        <Editor
          adapters={adapters}
          defaultMode="outline"
          initialContent={{
            type: 'doc',
            content: [...precedingBlocks, block('Parent', [block('Target')]), ...followingBlocks],
          }}
        />
      </div>,
    )
    await waitFor(() => expect(blockElement(rendered.container, 'Target')).toBeInTheDocument())

    const targetParagraph = paragraph(rendered.container, 'Target')
    targetParagraph.scrollIntoView({ block: 'center' })
    await userEvent.click(targetParagraph)
    const pageScrollBefore = window.scrollY
    const targetTopBefore = blockElement(rendered.container, 'Target').getBoundingClientRect().top

    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await waitFor(() => expect(parentBlockId(rendered.container, 'Target')).toBeNull())

    expect(window.scrollY - pageScrollBefore).toBe(0)
    expect(selectedDomBlockId()).toBe('Target')
    const targetTopDelta = blockElement(rendered.container, 'Target').getBoundingClientRect().top - targetTopBefore
    expect(Math.abs(targetTopDelta)).toBeLessThanOrEqual(1)
  })

  it('blocks non-contiguous Traditional Outdent from Shift-Tab without changing the document', async () => {
    const onDocumentChange = vi.fn()
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={outlineDocument()}
        onDocumentChange={onDocumentChange}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="D"]')).not.toBeNull())

    await userEvent.click(marker(rendered.container, 'B'), { modifiers: ['Meta'] })
    await userEvent.click(marker(rendered.container, 'D'), { modifiers: ['Meta'] })
    await userEvent.selectOptions(rendered.getByRole('combobox', { name: 'Outdent behavior' }), 'traditional')
    await userEvent.click(page.getByText('B', { exact: true }))
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')

    expect(parentBlockId(rendered.container, 'B')).toBe('P')
    expect(parentBlockId(rendered.container, 'D')).toBe('P')
    expect(selectedIds(rendered.container)).toEqual(['B', 'D'])
    expect(rendered.getByRole('status')).toHaveTextContent(
      'Traditional outdent requires consecutive blocks under the same parent. Adjust the selection or switch to Logical outdent.',
    )
    expect(onDocumentChange).not.toHaveBeenCalled()
  })

  it('disables Outdent when a selected block would cross the current Focus root', async () => {
    const onDocumentChange = vi.fn()
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{ type: 'doc', content: [block('F', [block('A', [block('B')])])] }}
        outline={{ defaultFocus: { blockId: 'F' } }}
        onDocumentChange={onDocumentChange}
      />,
    )
    await waitFor(() => expect(blockElement(rendered.container, 'F')).toHaveAttribute('data-outline-focus-root'))

    await userEvent.click(marker(rendered.container, 'A'), { modifiers: ['Meta'] })

    expect(rendered.getByRole('button', { name: 'Outdent selected blocks' })).toBeDisabled()
    expect(rendered.getByRole('status')).toHaveTextContent('This block cannot move outside the current Focus view.')
    expect(parentBlockId(rendered.container, 'A')).toBe('F')
    expect(onDocumentChange).not.toHaveBeenCalled()
  })

  it('keeps task controls interactive instead of treating them as Outline markers', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
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
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task item' }] }],
          }],
        }}
      />,
    )
    await rendered.findByRole('button', { name: 'Task status: todo' })

    await userEvent.click(page.getByRole('button', { name: 'Task status: todo' }))

    expect(await rendered.findByRole('button', { name: 'Task status: doing' })).toHaveAttribute('aria-pressed', 'false')
    expect(blockElement(rendered.container, 'Task')).not.toHaveAttribute('data-outline-focus-root')
  })

  it('keeps toggle controls interactive instead of treating them as Outline markers', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{
          type: 'doc',
          content: [blockWithBody(
            'Toggle',
            { type: 'paragraph', content: [{ type: 'text', text: 'Toggle item' }] },
            [block('Child')],
            'toggle',
          )],
        }}
      />,
    )
    await rendered.findByText('Child')

    await userEvent.click(marker(rendered.container, 'Toggle'))

    await waitFor(() => expect(blockElement(rendered.container, 'Toggle')).toHaveAttribute('data-list-collapsed'))
    expect(rendered.getByText('Child')).not.toBeVisible()
    expect(blockElement(rendered.container, 'Toggle')).not.toHaveAttribute('data-outline-focus-root')
  })

  it('navigates table cells with Tab and Shift-Tab without changing the Outline tree', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{
          type: 'doc',
          content: [blockWithBody(
            'Parent',
            { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
            [blockWithBody('Table', table())],
          )],
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
