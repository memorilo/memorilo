import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditorModeHarness } from '../../test/browser/editor-mode-harness'
import { EditorTestHarness as Editor } from '../../test/browser/editor-test-harness'
import { placeCaretAtStart, userEvent } from '../../test/browser/user-event'
import { EditorMode } from '../common/editor-mode'
import {
  adapters,
  block,
  blockElement,
  emptyBlock,
  marker,
  outlineDocument,
  paragraph,
  parentBlockId,
  selectedDomBlockId,
  selectedIds,
} from './outline-interactions.fixture'

describe('outline interactions', () => {
  it('keeps the first top-level Outline item wrapped at its start on Backspace', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode={EditorMode.Outline}
        initialContent={{ type: 'doc', content: [block('A'), block('B')] }}
      />,
    )
    await rendered.findByText('A')

    await placeCaretAtStart(paragraph(rendered.container, 'A'))
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
        mode={EditorMode.Outline}
        initialContent={{ type: 'doc', content: [block('A'), block('B')] }}
      />,
    )
    await rendered.findByText('B')

    await placeCaretAtStart(paragraph(rendered.container, 'B'))
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
        mode={EditorMode.Outline}
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
    const rendered = render(<EditorModeHarness adapters={adapters} initialContent={outlineDocument()} initialMode={EditorMode.Outline} />)
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
        mode={EditorMode.Outline}
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
        mode={EditorMode.Outline}
        initialContent={outlineDocument()}
        outline={{ focus: { blockId: 'D' } }}
      />,
    )

    await waitFor(() => expect(blockElement(rendered.container, 'D')).toHaveAttribute('data-outline-focus-root'))
    expect(blockElement(rendered.container, 'B')).toHaveAttribute('hidden')
  })

  it('edits a focused task and its children in content-only presentation', async () => {
    const onDocumentChange = vi.fn()
    const rendered = render(
      <Editor
        adapters={adapters}
        mode={EditorMode.Outline}
        initialContent={{
          type: 'doc',
          content: [
            block('Other block'),
            block('Task root', [block('Task child')], 'task'),
          ],
        }}
        outline={{ focus: { blockId: 'Task root' }, focusPresentation: 'content-only' }}
        onDocumentChange={onDocumentChange}
      />,
    )

    await waitFor(() => expect(blockElement(rendered.container, 'Task root')).toHaveAttribute('data-outline-focus-root'))
    expect(rendered.getByRole('textbox', { name: 'Editor content' }).closest('[data-editor-mode]')).toHaveAttribute(
      'data-editor-outline-focus-presentation',
      'content-only',
    )
    expect(blockElement(rendered.container, 'Other block')).toHaveAttribute('hidden')
    expect(blockElement(rendered.container, 'Task child')).not.toHaveAttribute('hidden')
    expect(rendered.queryByRole('button', { name: 'Show all blocks' })).toBeNull()

    const root = blockElement(rendered.container, 'Task root')
    const rootMarker = root.querySelector<HTMLElement>(':scope > .list-marker')
    const rootMeta = root.querySelector<HTMLElement>(':scope > [data-task-meta]')
    if (!rootMarker || !rootMeta)
      throw new Error('Focused task controls were not rendered')
    expect(getComputedStyle(rootMarker).display).toBe('none')
    expect(getComputedStyle(rootMeta).display).toBe('none')

    await userEvent.click(paragraph(rendered.container, 'Task root'))
    await userEvent.keyboard('{End} edited')
    await userEvent.click(paragraph(rendered.container, 'Task child'))
    await userEvent.keyboard('{End} edited')

    await waitFor(() => {
      expect(blockElement(rendered.container, 'Task root')).toHaveTextContent('Task root edited')
      expect(blockElement(rendered.container, 'Task child')).toHaveTextContent('Task child edited')
      expect(onDocumentChange).toHaveBeenCalled()
    })
  })

  it('keeps collapse state local and restores it after switching modes', async () => {
    const onDocumentChange = vi.fn()
    const rendered = render(
      <EditorModeHarness
        adapters={adapters}
        initialContent={outlineDocument()}
        initialMode={EditorMode.Outline}
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

  it.each([
    { behavior: 'logical', followingParentId: 'P' },
    { behavior: 'traditional', followingParentId: 'B' },
  ] as const)(
    'applies $behavior Outdent semantics to one active Outline block',
    async ({ behavior, followingParentId }) => {
      const rendered = render(
        <Editor
          adapters={adapters}
          mode={EditorMode.Outline}
          initialContent={{
            type: 'doc',
            content: [block('P', [block('A'), block('B'), block('C')])],
          }}
          outline={{ outdentBehavior: behavior }}
        />,
      )
      await waitFor(() => expect(blockElement(rendered.container, 'C')).toBeInTheDocument())

      await userEvent.click(paragraph(rendered.container, 'B'))
      await userEvent.keyboard('{Shift>}{Tab}{/Shift}')

      await waitFor(() => expect(parentBlockId(rendered.container, 'B')).toBeNull())
      expect(parentBlockId(rendered.container, 'A')).toBe('P')
      expect(parentBlockId(rendered.container, 'C')).toBe(followingParentId)
    },
  )
})
