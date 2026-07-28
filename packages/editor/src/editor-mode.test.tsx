import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from './adapters/editor-adapters'
import { render, waitFor, within } from '@testing-library/react'
import { page } from '@vitest/browser/context'
import { describe, expect, it, vi } from 'vitest'
import { userEvent } from '../test/browser/user-event'

import { Editor } from './editor'

const adapters: EditorAdapters = {
  uploadImage: async () => 'memory://image',
  tagStorage: {
    search: async () => [],
    create: async tag => tag,
    update: async tag => tag,
  },
}

function modeDocument(): NodeJSON {
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Plain block' }] },
      {
        type: 'list',
        attrs: { blockId: 'ordered-1', checked: false, collapsed: false, kind: 'ordered', order: 3 },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ordered block' }] }],
      },
    ],
  }
}

function listMarker(block: HTMLElement): HTMLElement {
  const marker = block.querySelector<HTMLElement>(':scope > .list-marker')
  if (!marker)
    throw new Error('Expected a rendered list marker')
  return marker
}

function markerAlignmentDelta(block: HTMLElement, firstLineCenter: number): number {
  const markerRect = listMarker(block).getBoundingClientRect()
  const markerCenter = markerRect.top + markerRect.height / 2
  return markerCenter - firstLineCenter
}

function elementCenter(element: HTMLElement): number {
  const rect = element.getBoundingClientRect()
  return rect.top + rect.height / 2
}

function codeFirstLineCenter(code: HTMLElement): number {
  const rect = code.getBoundingClientRect()
  const style = getComputedStyle(code)
  const paddingTop = Number.parseFloat(style.paddingTop)
  const lineHeight = Number.parseFloat(style.lineHeight)
  if (!Number.isFinite(paddingTop) || !Number.isFinite(lineHeight))
    throw new Error('Expected numeric code-block padding and line height')
  return rect.top + paddingTop + lineHeight / 2
}

describe('editor modes', () => {
  it('supports a controlled mode switch through mode and onModeChange', async () => {
    const onModeChange = vi.fn()
    const initialContent = modeDocument()
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={initialContent}
        mode="document"
        onModeChange={onModeChange}
      />,
    )
    await within(rendered.container).findByText('Plain block')

    await userEvent.click(page.getByRole('button', { name: 'Outline mode' }))
    expect(onModeChange).toHaveBeenCalledExactlyOnceWith('outline')
    expect(rendered.container.querySelector('[data-editor-mode="document"]')).not.toBeNull()

    rendered.rerender(
      <Editor
        adapters={adapters}
        initialContent={initialContent}
        mode="outline"
        onModeChange={onModeChange}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-editor-mode="outline"]')).not.toBeNull())
  })

  it('switches a non-empty document between projections without changing the document', async () => {
    const onDocumentChange = vi.fn()
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={modeDocument()}
        onDocumentChange={onDocumentChange}
      />,
    )

    await within(rendered.container).findByText('Plain block')
    await waitFor(() => expect(rendered.container.querySelector('[data-editor-mode="document"]')).not.toBeNull())
    expect(rendered.container.querySelector('[data-list-kind="ordered"]')).not.toBeNull()

    await userEvent.click(rendered.getByRole('button', { name: 'Outline mode' }))

    await waitFor(() => expect(rendered.container.querySelector('[data-editor-mode="outline"]')).not.toBeNull())
    await waitFor(() => expect(rendered.container.querySelector('[data-list-kind="outline"] > .list-marker')).not.toBeNull())
    expect(rendered.container.querySelector('[data-list-kind="ordered"]')).not.toBeNull()

    await userEvent.click(rendered.getByRole('button', { name: 'Document mode' }))

    await within(rendered.container).findByText('Plain block')
    await waitFor(() => expect(rendered.container.querySelector('[data-editor-mode="document"]')).not.toBeNull())
    expect(rendered.container.querySelector('[data-list-kind="ordered"]')).not.toBeNull()
    expect(onDocumentChange).not.toHaveBeenCalled()
  })

  it('keeps default Outline bullets distinct from semantic bullet and ordered lists', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Ordinary block' }] },
            {
              type: 'list',
              attrs: { blockId: 'bullet', kind: 'bullet' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Semantic bullet' }] }],
            },
            {
              type: 'list',
              attrs: { blockId: 'ordered', kind: 'ordered', order: 7 },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Semantic ordered' }] }],
            },
          ],
        }}
      />,
    )
    await within(rendered.container).findByText('Ordinary block')

    const ordinary = rendered.container.querySelector<HTMLElement>('[data-list-kind="outline"]')
    const bullet = rendered.container.querySelector<HTMLElement>('[data-block-id="bullet"]')
    const ordered = rendered.container.querySelector<HTMLElement>('[data-block-id="ordered"]')
    if (!ordinary || !bullet || !ordered)
      throw new Error('Expected ordinary, bullet, and ordered blocks to render')
    expect(getComputedStyle(listMarker(ordinary)).display).toBe('none')
    expect(bullet).toHaveAttribute('data-list-kind', 'bullet')
    expect(ordered).toHaveAttribute('data-list-kind', 'ordered')
    expect(ordered).toHaveAttribute('data-list-order', '7')

    await userEvent.click(rendered.getByRole('button', { name: 'Outline mode' }))
    await waitFor(() => {
      const outlineOrdinary = rendered.container.querySelector<HTMLElement>('[data-list-kind="outline"]')
      if (!outlineOrdinary)
        throw new Error('Expected the ordinary block in Outline mode')
      const markerStyle = getComputedStyle(listMarker(outlineOrdinary))
      expect(markerStyle.display).not.toBe('none')
      expect(markerStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
      expect(markerStyle.maskImage).not.toBe('none')
    })
    expect(rendered.container.querySelector('[data-block-id="bullet"]')).toHaveAttribute('data-list-kind', 'bullet')
    expect(rendered.container.querySelector('[data-block-id="ordered"]')).toHaveAttribute('data-list-kind', 'ordered')
    expect(rendered.container.querySelector('[data-block-id="ordered"]')).toHaveAttribute('data-list-order', '7')
  })

  it('aligns Outline markers with the first visible line of headings, code blocks, and quotes', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Marker heading' }],
            },
            {
              type: 'codeBlock',
              attrs: { language: 'javascript' },
              content: [{ type: 'text', text: 'const marker = true' }],
            },
            {
              type: 'blockquote',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Marker quote' }],
                },
              ],
            },
          ],
        }}
      />,
    )

    const heading = await within(rendered.container).findByRole('heading', { name: 'Marker heading' })
    await within(rendered.container).findByText('Marker quote')

    await waitFor(() => {
      const code = rendered.container.querySelector<HTMLElement>('pre[data-language]')
      const quote = rendered.container.querySelector<HTMLElement>('blockquote p')
      const blocks = [heading.closest<HTMLElement>('[data-block-id]'), code?.closest<HTMLElement>('[data-block-id]'), quote?.closest<HTMLElement>('[data-block-id]')]
      if (!code || !quote || blocks.some(block => !block))
        throw new Error('Expected heading, code, and quote Outline blocks')
      const firstLineCenters = [elementCenter(heading), codeFirstLineCenter(code), elementCenter(quote)]
      for (const [index, block] of (blocks as HTMLElement[]).entries())
        expect(Math.abs(markerAlignmentDelta(block, firstLineCenters[index]!))).toBeLessThanOrEqual(1)
    })
  })

  it('creates a new default Outline block with a unique stable id on Enter', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First block' }] }],
        }}
      />,
    )
    await within(rendered.container).findByText('First block')

    await userEvent.click(page.getByText('First block'))
    await userEvent.keyboard('{Enter}')
    await waitFor(() => {
      expect(rendered.container.querySelectorAll('[data-list-kind="outline"]')).toHaveLength(2)
    })
    const newParagraph = rendered.container.querySelector<HTMLElement>('[data-list-kind="outline"]:last-child p')
    if (!newParagraph)
      throw new Error('Expected Enter to create a second Outline paragraph')

    await waitFor(() => {
      const block = newParagraph.closest<HTMLElement>('[data-block-id]')
      if (!block)
        throw new Error('Expected the new paragraph inside an Outline block')
      expect(Math.abs(markerAlignmentDelta(block, elementCenter(newParagraph)))).toBeLessThanOrEqual(1)
    })

    await userEvent.keyboard('Second block')

    await within(rendered.container).findByText('Second block')
    const blocks = Array.from(rendered.container.querySelectorAll<HTMLElement>('[data-list-kind="outline"]'))
    expect(blocks).toHaveLength(2)
    const ids = blocks.map((block) => {
      const id = block.dataset.blockId
      if (!id)
        throw new Error('A split Outline block is missing its stable id')
      return id
    })
    expect(new Set(ids).size).toBe(2)
  })

  it.each([
    { kind: 'bullet', label: 'Bullet list' },
    { kind: 'ordered', label: 'Ordered list' },
  ])('creates a semantic $kind list from Outline mode and preserves it in Document mode', async ({ kind, label }) => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{
          type: 'doc',
          content: [{ type: 'paragraph' }],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-list-kind="outline"] p')).not.toBeNull())
    const paragraph = rendered.container.querySelector<HTMLElement>('[data-list-kind="outline"] p')
    if (!paragraph)
      throw new Error('Expected an empty Outline paragraph')

    await userEvent.click(page.getByRole('textbox', { name: 'Editor content' }))
    await userEvent.keyboard('/')
    await userEvent.click(page.getByText(label, { exact: true }))

    await waitFor(() => expect(rendered.container.querySelector(`[data-list-kind="${kind}"]`)).not.toBeNull())
    await userEvent.click(page.getByRole('button', { name: 'Document mode' }))
    await waitFor(() => expect(rendered.container.querySelector(`[data-list-kind="${kind}"]`)).not.toBeNull())
  })

  it('keeps undo and redo history when switching a non-empty document between modes', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        defaultMode="outline"
        initialContent={{
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'History block' }] }],
        }}
      />,
    )
    await rendered.findByText('History block')

    await userEvent.click(page.getByText('History block'))
    await userEvent.keyboard('{End} changed')
    expect(await within(rendered.container).findByText('History block changed')).toBeInTheDocument()

    await userEvent.click(page.getByRole('button', { name: 'Document mode' }))
    await userEvent.click(page.getByText('History block changed'))
    await userEvent.keyboard('{Meta>}z{/Meta}')
    expect(await within(rendered.container).findByText('History block')).toBeInTheDocument()
    expect(within(rendered.container).queryByText('History block changed')).not.toBeInTheDocument()

    await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    expect(await within(rendered.container).findByText('History block changed')).toBeInTheDocument()
  })
})
