import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import { act, render, waitFor, within } from '@testing-library/react'
import { page } from '@vitest/browser/context'
import { describe, expect, it } from 'vitest'

import { EditorTestHarness as Editor } from '../../test/browser/editor-test-harness'
import { userEvent } from '../../test/browser/user-event'
import { EditorMode } from '../common/editor-mode'

const adapters: EditorAdapters = {
  uploadImage: async () => 'memory://image',
  tagStorage: {
    create: async tag => tag,
    search: async () => [],
    update: async tag => tag,
  },
}

function block(id: string, body: NodeJSON): NodeJSON {
  return {
    type: 'list',
    attrs: { blockId: id, checked: false, collapsed: false, kind: 'outline', order: null },
    content: [body],
  }
}

function paragraph(text: string): NodeJSON {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function textBoundary(root: HTMLElement, offset: number): { node: Text, offset: number } {
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

async function selectTextRange(element: HTMLElement, from: number, to: number): Promise<void> {
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

describe('card authoring interactions', () => {
  it.each([
    { direction: 'forward', mode: EditorMode.Document, modeName: 'Document', symbol: '→', trigger: '：-》' },
    { direction: 'backward', mode: EditorMode.Document, modeName: 'Document', symbol: '←', trigger: '：-《' },
    { direction: 'both', mode: EditorMode.Document, modeName: 'Document', symbol: '↔', trigger: '：《》' },
    { direction: 'forward', mode: EditorMode.Outline, modeName: 'Outline', symbol: '→', trigger: '：-》' },
    { direction: 'backward', mode: EditorMode.Outline, modeName: 'Outline', symbol: '←', trigger: '：-《' },
    { direction: 'both', mode: EditorMode.Outline, modeName: 'Outline', symbol: '↔', trigger: '：《》' },
  ] as const)('creates a $direction Basic Card from $trigger in $modeName mode', async ({ direction, mode, symbol, trigger }) => {
    const rendered = render(
      <Editor
        adapters={adapters}
        mode={mode}
        initialContent={{ type: 'doc', content: [block('question', paragraph('Question'))] }}
      />,
    )
    await rendered.findByText('Question')

    await userEvent.click(rendered.getByText('Question'))
    await userEvent.keyboard(`{End}${trigger} `)

    await waitFor(() => {
      expect(rendered.container.querySelector('[data-card-delimiter]')).toHaveAttribute('data-card-direction', direction)
      expect(rendered.getByRole('textbox', { name: 'Editor content' })).toHaveTextContent(`Question${symbol}`)
      expect(rendered.getByRole('textbox', { name: 'Editor content' })).not.toHaveTextContent(trigger)
    })
  })

  it('inserts Basic, Reverse, and Bidirectional Cards from the ordinary slash menu', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{ type: 'doc', content: [block('question', paragraph('Question'))] }}
      />,
    )
    await rendered.findByText('Question')

    await userEvent.click(rendered.getByText('Question'))
    await userEvent.keyboard('{End}{Enter}/')

    expect(await rendered.findByRole('option', { name: 'Basic card :->' })).toBeVisible()
    expect(rendered.getByRole('option', { name: 'Reverse card :-<' })).toBeVisible()
    expect(rendered.getByRole('option', { name: 'Bidirectional card :<>' })).toBeVisible()

    await userEvent.click(rendered.getByRole('option', { name: 'Basic card :->' }))

    await waitFor(() => {
      expect(rendered.container.querySelector('[data-card-delimiter]')).toHaveAttribute('data-card-direction', 'forward')
      expect(rendered.getByRole('textbox', { name: 'Editor content' })).toHaveTextContent('Question→')
    })
  })

  it('applies Cloze from the selection bubble menu without a separate New Cloze Card action', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{ type: 'doc', content: [block('fact', paragraph('Euler identity'))] }}
      />,
    )
    await rendered.findByText('Euler identity')

    await userEvent.click(rendered.getByText('Euler identity'))
    await userEvent.keyboard('{Meta>}a{/Meta}')

    const cloze = await rendered.findByRole('button', { name: 'Cloze' })
    expect(rendered.queryByRole('button', { name: /New Cloze Card/i })).toBeNull()
    await userEvent.click(cloze)

    await waitFor(() => {
      const anchor = rendered.container.querySelector('[data-cloze-group-id]')
      expect(anchor).toHaveTextContent('Euler identity')
      expect(anchor).toHaveAttribute('data-cloze-anchor-kind', 'rich-content')
    })
  })

  it('creates a MathSourceCloze from a selected inline-formula source fragment', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [block('inline-formula', {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Euler: ' },
              { type: 'mathInline', content: [{ type: 'text', text: 'e^{i\\pi} + 1 = 0' }] },
            ],
          })],
        }}
      />,
    )
    await waitFor(() => {
      const element = rendered.container.querySelector<HTMLElement>('.prosemirror-math-inline')
      if (!element)
        throw new Error('Inline formula was not rendered')
      expect(element).toBeVisible()
    })
    const editorElement = rendered.getByRole('textbox', { name: 'Editor content' })
    await act(async () => editorElement.focus())
    await userEvent.keyboard('{End}{ArrowLeft}')
    const source = await waitFor(() => {
      const element = rendered.container.querySelector<HTMLElement>('.prosemirror-math-inline .prosemirror-math-source code')
      if (!element)
        throw new Error('Inline formula source editor was not rendered')
      expect(element).toBeVisible()
      return element
    })
    await selectTextRange(source, 3, 7)

    const formulaSelection = await rendered.findByRole('toolbar', { name: 'Formula selection' })
    expect(rendered.queryByTestId('inline-menu-main')).toBeNull()
    await userEvent.click(within(formulaSelection).getByRole('button', {
      name: 'Create Cloze from formula selection',
    }))

    await waitFor(() => {
      const anchor = rendered.container.querySelector('[data-cloze-anchor-kind="math-source"]')
      expect(anchor).toHaveTextContent('i\\pi')
    })
  })

  it('creates a MathSourceCloze from a selected block-formula source fragment', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [
            block('formula-intro', paragraph('Formula:')),
            block('block-formula', {
              type: 'mathBlock',
              content: [{ type: 'text', text: 'e^{i\\pi} + 1 = 0' }],
            }),
          ],
        }}
      />,
    )
    await waitFor(() => {
      const element = rendered.container.querySelector<HTMLElement>('.prosemirror-math-block')
      if (!element)
        throw new Error('Block formula was not rendered')
      expect(element).toBeVisible()
    })
    const source = await waitFor(() => {
      const element = rendered.container.querySelector<HTMLElement>('.prosemirror-math-block .prosemirror-math-source code')
      if (!element)
        throw new Error('Block formula source editor was not rendered')
      expect(element).toBeVisible()
      return element
    })
    await selectTextRange(source, 3, 7)

    const formulaSelection = await rendered.findByRole('toolbar', { name: 'Formula selection' })
    expect(formulaSelection).toHaveAttribute('data-math-cloze-kind', 'block')
    expect(rendered.queryByTestId('inline-menu-main')).toBeNull()
    await userEvent.click(within(formulaSelection).getByRole('button', {
      name: 'Create Cloze from formula selection',
    }))

    await waitFor(() => {
      const anchor = rendered.container.querySelector('[data-cloze-anchor-kind="math-source"]')
      expect(anchor).toHaveTextContent('i\\pi')
    })
  })

  it('removes an existing MathSourceCloze from the formula selection toolbar', async () => {
    const identity = {
      cardId: 'card-formula',
      definitionId: 'definition-formula',
      groupId: 'group-formula',
    }
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [block('inline-formula', {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Euler: ' },
              {
                type: 'mathInline',
                content: [
                  { type: 'text', text: 'e^{' },
                  {
                    type: 'text',
                    text: 'i\\pi',
                    marks: [{ type: 'cloze', attrs: { anchorKind: 'math-source', ...identity } }],
                  },
                  { type: 'text', text: '} + 1 = 0' },
                ],
              },
            ],
          })],
        }}
      />,
    )
    const formula = await waitFor(() => {
      const element = rendered.container.querySelector<HTMLElement>('.prosemirror-math-inline')
      if (!element)
        throw new Error('Inline formula was not rendered')
      return element
    })
    const display = formula.querySelector<HTMLElement>('.prosemirror-math-display')
    if (!display)
      throw new Error('Inline formula display was not rendered')

    const editorElement = rendered.getByRole('textbox', { name: 'Editor content' })
    await act(async () => editorElement.focus())
    await userEvent.keyboard('{End}{ArrowLeft}')
    const source = await waitFor(() => {
      const element = rendered.container.querySelector<HTMLElement>('.prosemirror-math-inline .prosemirror-math-source code')
      if (!element)
        throw new Error('Inline formula source editor was not rendered')
      expect(element).toBeVisible()
      return element
    })
    await selectTextRange(source, 3, 7)

    const remove = await rendered.findByRole('button', { name: 'Remove Cloze from formula selection' })
    expect(remove).toHaveAttribute('aria-pressed', 'true')
    expect(rendered.queryByTestId('inline-menu-main')).toBeNull()
    await userEvent.click(remove)

    await waitFor(() => {
      expect(rendered.container.querySelector('[data-cloze-anchor-kind="math-source"]')).toBeNull()
      expect(source).toHaveTextContent('e^{i\\pi} + 1 = 0')
    })
  })

  it('creates a previewable Card scope when Cloze is applied', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{ type: 'doc', content: [block('fact', paragraph('Euler identity'))] }}
      />,
    )
    await rendered.findByText('Euler identity')

    await userEvent.click(rendered.getByText('Euler identity'))
    await userEvent.keyboard('{Meta>}a{/Meta}')
    await userEvent.click(await rendered.findByRole('button', { name: 'Cloze' }))

    const anchor = await waitFor(() => {
      const element = rendered.container.querySelector<HTMLElement>('[data-cloze-group-id]')
      if (!element)
        throw new Error('Cloze anchor was not rendered')
      return element
    })
    const definitionId = anchor.dataset.clozeDefinitionId
    if (!definitionId)
      throw new Error('Cloze anchor is missing its DefinitionID')
    const source = rendered.container.querySelector<HTMLElement>('[data-block-id="fact"]')
    if (!source)
      throw new Error('Cloze source Block was not rendered')

    expect(source).toHaveAttribute('data-card-definition-scope', definitionId)
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.hover(page.getByText('Euler identity', { exact: true }))
    expect(await rendered.findByRole('button', { name: 'Preview card' })).toBeVisible()
    expect(rendered.queryByRole('button', { name: 'Card options' })).toBeNull()

    await userEvent.click(rendered.getByRole('button', { name: 'Preview card' }))
    expect(await rendered.findByRole('dialog', { name: 'Card preview' })).toBeVisible()
    expect(rendered.getByLabelText('Hidden cloze')).toBeVisible()
  })

  it('dismisses the selection bubble when Cloze Preview opens', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{ type: 'doc', content: [block('fact', paragraph('Euler identity'))] }}
      />,
    )
    await rendered.findByText('Euler identity')

    await userEvent.click(rendered.getByText('Euler identity'))
    await userEvent.keyboard('{Meta>}a{/Meta}')
    await userEvent.click(await rendered.findByRole('button', { name: 'Cloze' }))

    const source = rendered.container.querySelector<HTMLElement>('[data-block-id="fact"]')
    if (!source)
      throw new Error('Cloze source Block was not rendered')
    await userEvent.hover(source)
    expect(await rendered.findByTestId('inline-menu-main')).toBeVisible()

    await userEvent.click(await rendered.findByRole('button', { name: 'Preview card' }))

    expect(await rendered.findByRole('dialog', { name: 'Card preview' })).toBeVisible()
    expect(rendered.queryByTestId('inline-menu-main')).toBeNull()
  })

  it('keeps MathSourceCloze Preview available while an inline formula is rendered', async () => {
    const identity = {
      cardId: 'card-euler-formula',
      definitionId: 'definition-euler-formula',
      groupId: 'group-euler-formula',
    }
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [block('formula', {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Euler identity:' },
              {
                type: 'mathInline',
                content: [
                  { type: 'text', text: 'e^{' },
                  {
                    type: 'text',
                    marks: [{ type: 'cloze', attrs: { anchorKind: 'math-source', ...identity } }],
                    text: 'i\\pi',
                  },
                  { type: 'text', text: '} + 1 = 0' },
                ],
              },
            ],
          })],
        }}
      />,
    )
    await rendered.findByText('Euler identity:')
    const source = rendered.container.querySelector<HTMLElement>('[data-block-id="formula"]')
    if (!source)
      throw new Error('Formula Cloze source Block was not rendered')

    await userEvent.hover(source)
    const preview = await waitFor(() => {
      const control = rendered.container.querySelector<HTMLButtonElement>(
        '[data-block-id="formula"] button[aria-label="Preview card"]',
      )
      if (!control)
        throw new Error('MathSourceCloze Preview control was not rendered')
      expect(control).toBeVisible()
      return control
    })

    await userEvent.click(preview)
    const dialog = await rendered.findByRole('dialog', { name: 'Card preview' })
    expect(dialog).toBeVisible()
    const surface = within(dialog).getByTestId('card-preview-surface')
    expect(within(surface).queryByLabelText('Hidden cloze')).toBeNull()
    expect(surface.querySelector('.prosemirror-math-display')).toHaveAttribute(
      'data-card-review-math-source',
      'e^{\\text{\\ldots}} + 1 = 0',
    )
  })

  it('previews two independent Cloze Cards from one Source Block', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [block('two-clozes', {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{
                  type: 'cloze',
                  attrs: {
                    anchorKind: 'rich-content',
                    cardId: 'card-alpha',
                    definitionId: 'definition-alpha',
                    groupId: 'group-alpha',
                  },
                }],
                text: 'Alpha',
              },
              { type: 'text', text: ' and ' },
              {
                type: 'text',
                marks: [{
                  type: 'cloze',
                  attrs: {
                    anchorKind: 'rich-content',
                    cardId: 'card-beta',
                    definitionId: 'definition-beta',
                    groupId: 'group-beta',
                  },
                }],
                text: 'Beta',
              },
            ],
          })],
        }}
      />,
    )
    await rendered.findByText('Alpha')
    const source = rendered.container.querySelector<HTMLElement>('[data-block-id="two-clozes"]')
    if (!source)
      throw new Error('Two-Cloze Source Block was not rendered')
    await userEvent.hover(page.getByText('Alpha', { exact: true }))
    await waitFor(() => expect(rendered.container.querySelectorAll('[data-cloze-card-controls]')).toHaveLength(2))
    for (const definitionId of ['definition-alpha', 'definition-beta']) {
      await waitFor(() => {
        const controlsElement = rendered.container.querySelector<HTMLElement>(`[data-cloze-card-controls="${definitionId}"]`)
        if (!controlsElement)
          throw new Error(`Cloze controls for ${definitionId} were not rendered`)
        expect(within(controlsElement).getByRole('button', { name: 'Preview card' })).toBeVisible()
      })
    }

    const currentSource = rendered.container.querySelector<HTMLElement>('[data-block-id="two-clozes"]')
    if (!currentSource)
      throw new Error('Two-Cloze Source Block was replaced unexpectedly')
    const alphaControls = currentSource.querySelector<HTMLElement>('[data-cloze-card-controls="definition-alpha"]')
    const betaControls = currentSource.querySelector<HTMLElement>('[data-cloze-card-controls="definition-beta"]')
    if (!alphaControls || !betaControls)
      throw new Error('Each Cloze definition must render its own Preview controls')
    const alphaPreview = within(alphaControls).getByRole('button', { name: 'Preview card' })
    const alphaRect = alphaControls.getBoundingClientRect()
    const betaRect = betaControls.getBoundingClientRect()
    expect(Math.min(alphaRect.right, betaRect.right)).toBeLessThanOrEqual(
      Math.max(alphaRect.left, betaRect.left),
    )

    await userEvent.click(alphaPreview)
    const alphaDialog = await rendered.findByRole('dialog', { name: 'Card preview' })
    expect(within(alphaDialog).getByLabelText('Hidden cloze')).toBeVisible()
    const alphaSurface = within(alphaDialog).getByTestId('card-preview-surface')
    expect(within(alphaSurface).getByText('Beta')).toBeVisible()
    expect(within(alphaSurface).getByText('Alpha')).not.toBeVisible()

    await userEvent.click(within(alphaDialog).getByRole('button', { name: 'Close preview' }))
    await waitFor(() => expect(rendered.queryByRole('dialog', { name: 'Card preview' })).toBeNull())
    const currentBetaControls = rendered.container.querySelector<HTMLElement>('[data-cloze-card-controls="definition-beta"]')
    if (!currentBetaControls)
      throw new Error('Beta Cloze controls disappeared after closing Preview')
    await userEvent.click(within(currentBetaControls).getByRole('button', { name: 'Preview card' }))
    const betaDialog = await rendered.findByRole('dialog', { name: 'Card preview' })
    expect(within(betaDialog).getByLabelText('Hidden cloze')).toBeVisible()
    const betaSurface = within(betaDialog).getByTestId('card-preview-surface')
    expect(within(betaSurface).getByText('Alpha')).toBeVisible()
    expect(within(betaSurface).getByText('Beta')).not.toBeVisible()
  })

  it('keeps Basic controls usable when a Cloze shares the Source Block', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [block('basic-and-cloze', {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Question' },
              {
                type: 'cardDelimiter',
                attrs: {
                  backwardCardId: null,
                  definitionId: 'definition-basic',
                  direction: 'forward',
                  forwardCardId: 'card-basic',
                },
              },
              { type: 'text', text: 'Answer with ' },
              {
                type: 'text',
                marks: [{
                  type: 'cloze',
                  attrs: {
                    anchorKind: 'rich-content',
                    cardId: 'card-cloze',
                    definitionId: 'definition-cloze',
                    groupId: 'group-cloze',
                  },
                }],
                text: 'Hint',
              },
            ],
          })],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-card-delimiter]')).not.toBeNull())
    const source = rendered.container.querySelector<HTMLElement>('[data-block-id="basic-and-cloze"]')
    const delimiter = rendered.container.querySelector<HTMLElement>('[data-card-delimiter]')
    if (!source || !delimiter)
      throw new Error('Basic and Cloze source structure was not rendered')
    await userEvent.hover(page.getByText('Question', { exact: false }))

    await waitFor(() => {
      const currentDelimiter = rendered.container.querySelector<HTMLElement>('[data-card-delimiter]')
      const clozeControls = rendered.container.querySelector<HTMLElement>('[data-cloze-card-controls="definition-cloze"]')
      if (!currentDelimiter || !clozeControls)
        throw new Error('Shared Source Block controls were not rendered')
      expect(within(currentDelimiter).getByRole('button', { name: 'Card options' })).toBeVisible()
      expect(within(clozeControls).getByRole('button', { name: 'Preview card' })).toBeVisible()
      expect(within(clozeControls).queryByRole('button', { name: 'Card options' })).toBeNull()
    })

    const currentDelimiter = rendered.container.querySelector<HTMLElement>('[data-card-delimiter]')
    if (!currentDelimiter)
      throw new Error('Basic delimiter disappeared before opening Card options')
    await userEvent.click(within(currentDelimiter).getByRole('button', { name: 'Card options' }))
    expect(await rendered.findByRole('toolbar', { name: 'Card options' })).toBeVisible()
    expect(rendered.getByRole('button', { name: 'Basic direction' })).toHaveAttribute('aria-pressed', 'true')
    const selectedDelimiter = rendered.container.querySelector<HTMLElement>('[data-card-delimiter]')
    if (!selectedDelimiter)
      throw new Error('Basic delimiter disappeared while Card options were open')
    await userEvent.click(selectedDelimiter)
    await userEvent.hover(page.getByText('Question', { exact: false }))
    const previewDelimiter = rendered.container.querySelector<HTMLElement>('[data-card-delimiter]')
    if (!previewDelimiter)
      throw new Error('Basic delimiter disappeared before opening Preview')
    await userEvent.click(within(previewDelimiter).getByRole('button', { name: 'Preview card' }))
    const basicDialog = await rendered.findByRole('dialog', { name: 'Card preview' })
    expect(basicDialog).toHaveAttribute('aria-label', 'Card preview')
    expect(within(basicDialog).getByTestId('card-preview-surface')).toHaveAttribute('data-card-id', 'card-basic')
    await userEvent.click(within(basicDialog).getByRole('button', { name: 'Close preview' }))
    await waitFor(() => expect(rendered.queryByRole('dialog', { name: 'Card preview' })).toBeNull())

    const currentClozeControls = rendered.container.querySelector<HTMLElement>('[data-cloze-card-controls="definition-cloze"]')
    if (!currentClozeControls)
      throw new Error('Cloze Preview controls disappeared after closing Basic Preview')
    await userEvent.click(within(currentClozeControls).getByRole('button', { name: 'Preview card' }))
    const clozeDialog = await rendered.findByRole('dialog', { name: 'Card preview' })
    expect(within(clozeDialog).getByTestId('card-preview-surface')).toHaveAttribute('data-card-id', 'card-cloze')
    expect(within(clozeDialog).getByLabelText('Hidden cloze')).toBeVisible()
  })

  it('applies inline Highlight from the same selection bubble menu', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{ type: 'doc', content: [block('fact', paragraph('Important fact'))] }}
      />,
    )
    await rendered.findByText('Important fact')

    await userEvent.click(rendered.getByText('Important fact'))
    await userEvent.keyboard('{Meta>}a{/Meta}')
    await userEvent.click(await rendered.findByRole('button', { name: 'Highlight' }))

    await waitFor(() => {
      expect(rendered.container.querySelector('[data-inline-highlight="yellow"]')).toHaveTextContent('Important fact')
    })
  })

  it('applies whole-block Highlight from the ordinary command menu', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{ type: 'doc', content: [block('fact', paragraph('Important block'))] }}
      />,
    )
    await rendered.findByText('Important block')

    await userEvent.click(rendered.getByText('Important block'))
    await userEvent.keyboard('{End}{Enter}/')
    await userEvent.click(await rendered.findByRole('option', { name: 'Highlight block' }))

    await waitFor(() => {
      expect(rendered.container.querySelector('[data-block-highlight="yellow"]')).not.toBeNull()
    })
  })

  it('uses the separate Card options control to convert an inline Card into a ListCard', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [block('planets', paragraph('First planet'))],
        }}
      />,
    )
    await rendered.findByText('First planet')
    await userEvent.click(rendered.getByText('First planet'))
    await userEvent.keyboard('{End}:-> Mercury')
    await waitFor(() => expect(rendered.container.querySelector('[data-card-delimiter]')).not.toBeNull())
    const delimiter = rendered.container.querySelector<HTMLElement>('[data-card-delimiter]')
    if (!delimiter)
      throw new Error('Inline Card delimiter was not rendered')
    const definitionId = delimiter.dataset.cardDefinitionId
    if (!definitionId)
      throw new Error('Inline Card delimiter is missing its DefinitionID')
    expect(delimiter).not.toHaveClass('card-delimiter-multiline')

    await userEvent.hover(page.getByText('First planet', { exact: false }))
    const openOptions = await rendered.findByRole('button', { name: 'Card options' })
    expect(await rendered.findByRole('button', { name: 'Preview card' })).toBeVisible()
    expect(openOptions).toBeVisible()

    await userEvent.click(delimiter)
    expect(rendered.queryByRole('toolbar', { name: 'Card options' })).toBeNull()

    await userEvent.click(openOptions)
    const listAnswer = await rendered.findByRole('button', { name: 'List answer' })
    const basicDirection = rendered.getByRole('button', { name: 'Basic direction' })
    const reverseDirection = rendered.getByRole('button', { name: 'Reverse direction' })
    expect(rendered.getByRole('toolbar', { name: 'Card options' })).toBeVisible()
    expect(rendered.queryByRole('button', { name: 'Preview' })).toBeNull()
    expect(rendered.queryByTestId('inline-menu-main')).toBeNull()
    expect(basicDirection).toHaveAttribute('aria-pressed', 'true')
    expect(reverseDirection).toHaveAttribute('aria-pressed', 'false')
    expect(getComputedStyle(basicDirection).boxShadow).toContain('inset')
    expect(Number.parseInt(getComputedStyle(basicDirection).fontWeight, 10)).toBeGreaterThan(
      Number.parseInt(getComputedStyle(reverseDirection).fontWeight, 10),
    )
    await act(async () => {
      await userEvent.click(listAnswer)
    })

    await waitFor(() => {
      const member = rendered.container.querySelector(`[data-card-item-definition-id="${definitionId}"]`)
      expect(member).toHaveAttribute('data-list-kind', 'ordered')
      expect(member).toHaveTextContent('Mercury')
      expect(rendered.container.querySelector('[data-card-delimiter]')).toHaveClass('card-delimiter-multiline')
      expect(rendered.container.querySelector('[data-block-id="planets"] > .list-content > p')).toHaveTextContent('First planet→')
    })
  })

  it('uses one liquid-glass scope when any part of a multi-line Card is hovered', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [{
            type: 'list',
            attrs: { blockId: 'capital', checked: false, collapsed: false, kind: 'outline', order: null },
            content: [{
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Capital of France' },
                {
                  type: 'cardDelimiter',
                  attrs: {
                    backwardCardId: null,
                    definitionId: 'capital-definition',
                    direction: 'forward',
                    forwardCardId: 'capital-forward',
                  },
                },
              ],
            }, {
              type: 'list',
              attrs: {
                blockId: 'capital-answer-one',
                cardItemDefinitionId: 'capital-definition',
                checked: false,
                collapsed: false,
                kind: 'bullet',
                order: null,
              },
              content: [paragraph('Paris')],
            }, {
              type: 'list',
              attrs: {
                blockId: 'capital-answer-two',
                cardItemDefinitionId: 'capital-definition',
                checked: false,
                collapsed: false,
                kind: 'bullet',
                order: null,
              },
              content: [paragraph('Lyon')],
            }],
          }],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-card-delimiter]')).not.toBeNull())
    const source = rendered.container.querySelector<HTMLElement>('[data-block-id="capital"]')
    if (!source)
      throw new Error('Card source was not rendered')

    expect(source).toHaveAttribute('data-card-definition-scope', 'capital-definition')
    expect(rendered.container.querySelectorAll('[data-card-definition-scope]')).toHaveLength(1)
    expect(rendered.container.querySelector('[data-block-id="capital-answer-one"]')).not.toHaveAttribute('data-card-definition-scope')
    expect(rendered.container.querySelector('[data-block-id="capital-answer-two"]')).not.toHaveAttribute('data-card-definition-scope')

    await userEvent.hover(page.getByText('Lyon', { exact: true }))
    expect(source.matches(':hover')).toBe(true)
    await waitFor(() => {
      const contentStyle = getComputedStyle(source)
      const material = source.querySelector<HTMLElement>('[data-card-material="capital-definition"]')
      if (!material)
        throw new Error('Multi-line Card has no dedicated glass material element')
      const materialStyle = getComputedStyle(material)
      expect(contentStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)')
      expect(materialStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
      expect(materialStyle.backdropFilter).toContain('blur(')
      expect(materialStyle.boxShadow).not.toBe('none')
    })

    const controls = rendered.getByRole('group', { name: 'Card controls' })
    const sourceRect = source.getBoundingClientRect()
    const controlsRect = controls.getBoundingClientRect()
    expect(controlsRect.right).toBeGreaterThanOrEqual(sourceRect.right - 4)
    expect(controlsRect.right).toBeLessThanOrEqual(sourceRect.right + 12)
    expect(controlsRect.top).toBeLessThanOrEqual(sourceRect.top + 4)
    expect(rendered.container.querySelectorAll('[data-card-scope-hover]')).toHaveLength(0)
  })

  it('keeps single-line Card text vertically balanced inside its glass material', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [
            block('single-line-card', {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Question' },
                {
                  type: 'cardDelimiter',
                  attrs: {
                    backwardCardId: null,
                    definitionId: 'single-line-definition',
                    direction: 'forward',
                    forwardCardId: 'single-line-forward',
                  },
                },
                { type: 'text', text: 'Answer' },
              ],
            }),
            block('ordinary-block', paragraph('Ordinary text')),
          ],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-card-delimiter]')).not.toBeNull())
    const source = rendered.container.querySelector<HTMLElement>('[data-card-definition-scope="single-line-definition"]')
    if (!source)
      throw new Error('Single-line Card source was not rendered')
    await userEvent.hover(source)
    const material = source.querySelector<HTMLElement>('[data-card-material="single-line-definition"]')
    if (!material)
      throw new Error('Single-line Card has no dedicated glass material element')
    const sourceParagraph = source.querySelector<HTMLElement>(':scope > .list-content > p')
    if (!sourceParagraph)
      throw new Error('Single-line Card source has no paragraph')
    const textNode = Array.from(sourceParagraph.childNodes).find(node => node.nodeType === Node.TEXT_NODE && typeof node.textContent === 'string' && node.textContent.includes('Question'))
    if (!textNode)
      throw new Error('Single-line Card source has no question text node')
    const range = document.createRange()
    range.selectNodeContents(textNode)
    const textRect = range.getBoundingClientRect()
    const materialRect = material.getBoundingClientRect()
    const ordinaryParagraph = rendered.container.querySelector<HTMLElement>('[data-block-id="ordinary-block"] > .list-content > p')
    if (!ordinaryParagraph)
      throw new Error('Ordinary block after the Card was not rendered')
    const ordinaryTextNode = ordinaryParagraph.firstChild
    if (!ordinaryTextNode)
      throw new Error('Ordinary block after the Card has no text node')
    const ordinaryRange = document.createRange()
    ordinaryRange.selectNodeContents(ordinaryTextNode)
    const ordinaryTextRect = ordinaryRange.getBoundingClientRect()
    const topGap = textRect.top - materialRect.top
    const bottomGap = materialRect.bottom - textRect.bottom

    expect(topGap).toBeGreaterThanOrEqual(8)
    expect(topGap).toBeLessThanOrEqual(12)
    expect(bottomGap).toBeGreaterThanOrEqual(8)
    expect(bottomGap).toBeLessThanOrEqual(12)
    expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(2)
    expect(ordinaryTextRect.top - materialRect.bottom).toBeGreaterThanOrEqual(4)
  })

  it('collapses a one-answer SetCard back to one line on Backspace at the answer start', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [{
            type: 'list',
            attrs: { blockId: 'set-question', checked: false, collapsed: false, kind: 'outline', order: null },
            content: [{
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Question' },
                {
                  type: 'cardDelimiter',
                  attrs: {
                    backwardCardId: null,
                    definitionId: 'set-definition',
                    direction: 'forward',
                    forwardCardId: 'set-forward-card',
                  },
                },
              ],
            }, {
              type: 'list',
              attrs: {
                blockId: 'set-answer',
                cardItemDefinitionId: 'set-definition',
                checked: false,
                collapsed: false,
                kind: 'bullet',
                order: null,
              },
              content: [paragraph('Answer')],
            }],
          }],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="set-answer"]')).not.toBeNull())
    const answer = rendered.container.querySelector<HTMLElement>('[data-block-id="set-answer"] > .list-content > p')
    if (!answer)
      throw new Error('SetCard answer paragraph was not rendered')
    await userEvent.click(answer)
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)

    await userEvent.keyboard('{Backspace}')

    await waitFor(() => {
      const sourceParagraph = rendered.container.querySelector('[data-block-id="set-question"] > .list-content > p')
      expect(sourceParagraph).toHaveTextContent('Question→Answer')
      expect(rendered.container.querySelector('[data-block-id="set-answer"]')).toBeNull()
      expect(rendered.container.querySelector('[data-card-item-definition-id="set-definition"]')).toBeNull()
    })
    const delimiter = rendered.container.querySelector('[data-card-delimiter]')
    expect(delimiter).toHaveAttribute('data-card-definition-id', 'set-definition')
    expect(delimiter).toHaveAttribute('data-forward-card-id', 'set-forward-card')
    expect(delimiter).not.toHaveClass('card-delimiter-multiline')
  })

  it('preserves the answer Block Highlight and task history when collapsing a SetCard to one line', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [{
            type: 'list',
            attrs: { blockId: 'set-question', checked: false, collapsed: false, kind: 'outline', order: null },
            content: [{
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Question' },
                {
                  type: 'cardDelimiter',
                  attrs: {
                    backwardCardId: null,
                    definitionId: 'set-definition',
                    direction: 'forward',
                    forwardCardId: 'set-forward-card',
                  },
                },
              ],
            }, {
              type: 'list',
              attrs: {
                blockHighlight: 'blue',
                blockId: 'set-answer',
                cardItemDefinitionId: 'set-definition',
                checked: false,
                collapsed: false,
                kind: 'bullet',
                order: null,
              },
              content: [{
                type: 'paragraph',
                attrs: { taskHistory: { elapsedMs: 900, status: 'doing' } },
                content: [{ type: 'text', text: 'Answer' }],
              }],
            }],
          }],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="set-answer"]')).not.toBeNull())
    const answer = rendered.container.querySelector<HTMLElement>('[data-block-id="set-answer"] > .list-content > p')
    if (!answer)
      throw new Error('Highlighted SetCard answer paragraph was not rendered')
    await userEvent.click(answer)
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)
    await userEvent.keyboard('{Backspace}')

    await waitFor(() => {
      const source = rendered.container.querySelector('[data-block-id="set-question"]')
      expect(source).toHaveAttribute('data-block-highlight', 'blue')
      expect(source).toHaveTextContent('Question→Answer')
      const sourceParagraph = source?.querySelector(':scope > .list-content > p')
      const taskHistory = sourceParagraph?.getAttribute('data-task-history')
      if (!taskHistory)
        throw new Error('Collapsed SetCard source paragraph did not preserve task history')
      expect(JSON.parse(taskHistory)).toEqual({ elapsedMs: 900, status: 'doing' })
      expect(rendered.container.querySelector('[data-block-id="set-answer"]')).toBeNull()
    })
  })

  it('keeps a SetCard unchanged when Source and Answer Block Highlights cannot be merged without data loss', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [{
            type: 'list',
            attrs: {
              blockHighlight: 'yellow',
              blockId: 'set-question',
              checked: false,
              collapsed: false,
              kind: 'outline',
              order: null,
            },
            content: [{
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Question' },
                {
                  type: 'cardDelimiter',
                  attrs: {
                    backwardCardId: null,
                    definitionId: 'set-definition',
                    direction: 'forward',
                    forwardCardId: 'set-forward-card',
                  },
                },
              ],
            }, {
              type: 'list',
              attrs: {
                blockHighlight: 'blue',
                blockId: 'set-answer',
                cardItemDefinitionId: 'set-definition',
                checked: false,
                collapsed: false,
                kind: 'bullet',
                order: null,
              },
              content: [paragraph('Answer')],
            }],
          }],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="set-answer"]')).not.toBeNull())
    const answer = rendered.container.querySelector<HTMLElement>('[data-block-id="set-answer"] > .list-content > p')
    if (!answer)
      throw new Error('Conflicting Highlight SetCard answer paragraph was not rendered')
    await userEvent.click(answer)
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)
    await userEvent.keyboard('{Backspace}')

    const source = rendered.container.querySelector('[data-block-id="set-question"]')
    const answerBlock = rendered.container.querySelector('[data-block-id="set-answer"]')
    expect(source).toHaveAttribute('data-block-highlight', 'yellow')
    expect(source).toHaveTextContent('Question→')
    expect(answerBlock).toHaveAttribute('data-block-highlight', 'blue')
    expect(answerBlock).toHaveAttribute('data-card-item-definition-id', 'set-definition')
    expect(answerBlock).toHaveTextContent('Answer')
  })

  it.each(['outline', 'task', 'toggle'] as const)('collapses a %s SetCard member because every non-ordered member is a Set answer', async (kind) => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [{
            type: 'list',
            attrs: { blockId: 'set-question', checked: false, collapsed: false, kind: 'outline', order: null },
            content: [{
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Question' },
                {
                  type: 'cardDelimiter',
                  attrs: {
                    backwardCardId: null,
                    definitionId: 'set-definition',
                    direction: 'forward',
                    forwardCardId: 'set-forward-card',
                  },
                },
              ],
            }, {
              type: 'list',
              attrs: {
                blockId: 'set-answer',
                cardItemDefinitionId: 'set-definition',
                checked: kind === 'task',
                collapsed: false,
                kind,
                order: null,
                ...(kind === 'task' ? { elapsedMs: 1200, startedAt: null, status: 'done' } : {}),
              },
              content: [paragraph('Answer')],
            }],
          }],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="set-answer"]')).not.toBeNull())
    const answer = rendered.container.querySelector<HTMLElement>('[data-block-id="set-answer"] > .list-content > p')
    if (!answer)
      throw new Error(`${kind} SetCard answer paragraph was not rendered`)
    await userEvent.click(answer)
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)
    await userEvent.keyboard('{Backspace}')

    await waitFor(() => {
      const sourceParagraph = rendered.container.querySelector('[data-block-id="set-question"] > .list-content > p')
      expect(sourceParagraph).toHaveTextContent('Question→Answer')
      if (kind === 'task')
        expect(sourceParagraph).toHaveAttribute('data-task-history', JSON.stringify({ status: 'done', elapsedMs: 1200 }))
      expect(rendered.container.querySelector('[data-block-id="set-answer"]')).toBeNull()
    })
  })

  it('collapses a heading Bidirectional SetCard without changing either CardID and keeps the cursor at the answer end', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [{
            type: 'list',
            attrs: { blockId: 'set-question', checked: false, collapsed: false, kind: 'outline', order: null },
            content: [{
              type: 'heading',
              attrs: { level: 2 },
              content: [
                { type: 'text', text: 'Question' },
                {
                  type: 'cardDelimiter',
                  attrs: {
                    backwardCardId: 'set-backward-card',
                    definitionId: 'set-definition',
                    direction: 'both',
                    forwardCardId: 'set-forward-card',
                  },
                },
              ],
            }, {
              type: 'list',
              attrs: {
                blockId: 'set-answer',
                cardItemDefinitionId: 'set-definition',
                checked: false,
                collapsed: false,
                kind: 'bullet',
                order: null,
              },
              content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Answer' }] }],
            }],
          }],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="set-answer"]')).not.toBeNull())
    const answer = rendered.container.querySelector<HTMLElement>('[data-block-id="set-answer"] > .list-content > h2')
    if (!answer)
      throw new Error('Heading SetCard answer was not rendered')
    await userEvent.click(answer)
    await userEvent.keyboard('{Home}')
    expect(document.getSelection()?.focusOffset).toBe(0)
    await userEvent.keyboard('{Backspace}!')

    await waitFor(() => {
      expect(rendered.container.querySelector('[data-block-id="set-question"] > .list-content > h2')).toHaveTextContent('Question↔Answer!')
      expect(rendered.container.querySelector('[data-block-id="set-answer"]')).toBeNull()
    })
    const delimiter = rendered.container.querySelector('[data-card-delimiter]')
    expect(delimiter).toHaveAttribute('data-card-definition-id', 'set-definition')
    expect(delimiter).toHaveAttribute('data-forward-card-id', 'set-forward-card')
    expect(delimiter).toHaveAttribute('data-backward-card-id', 'set-backward-card')
  })

  it('opens Preview from the Card hover control rather than the options menu', async () => {
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={{
          type: 'doc',
          content: [block('capital', {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Capital of France' },
              {
                type: 'cardDelimiter',
                attrs: {
                  backwardCardId: null,
                  definitionId: 'capital-definition',
                  direction: 'forward',
                  forwardCardId: 'capital-forward',
                },
              },
              { type: 'text', text: 'Paris' },
            ],
          })],
        }}
      />,
    )
    await waitFor(() => expect(rendered.container.querySelector('[data-card-delimiter]')).not.toBeNull())
    await userEvent.hover(page.getByText('Capital of France', { exact: false }))
    const previewButton = await rendered.findByRole('button', { name: 'Preview card' })
    await waitFor(() => {
      expect(previewButton).toBeVisible()
      expect(rendered.getByRole('button', { name: 'Card options' })).toBeVisible()
    })

    await userEvent.click(previewButton)

    const preview = await rendered.findByRole('dialog', { name: 'Card preview' })
    expect(rendered.queryByRole('toolbar', { name: 'Card options' })).toBeNull()
    expect(rendered.container.querySelector('[data-block-id="capital"]')).toHaveAttribute('data-card-scope-active')
    expect(rendered.container.querySelectorAll('[data-card-scope-active]')).toHaveLength(1)
    expect(within(preview).getByText('Capital of France')).toBeInTheDocument()
    expect(within(preview).getByText('Paris')).not.toBeVisible()
    const previewEditor = within(preview).getByTestId('card-preview-surface').querySelector('.ProseMirror')
    if (!previewEditor)
      throw new Error('Card Preview did not mount a ProseMirror Editor')

    await act(async () => {
      await userEvent.click(within(preview).getByRole('button', { name: 'Show answer' }))
    })
    await waitFor(() => expect(
      within(preview).getByTestId('card-preview-surface').querySelector('[data-card-review-hidden]'),
    ).toBeNull())
    expect(within(preview).getByTestId('card-preview-surface')).toHaveTextContent('Paris')
    expect(within(preview).getByTestId('card-preview-surface').querySelector('.ProseMirror')).toBe(previewEditor)

    await act(async () => {
      await userEvent.keyboard('{Escape}')
    })
    await waitFor(() => {
      expect(rendered.queryByRole('dialog', { name: 'Card preview' })).toBeNull()
      expect(rendered.container.querySelector('[data-card-scope-active]')).toBeNull()
    })
  })
})
