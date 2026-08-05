import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  createPagesTestEnvironment,
  launchPagesTestApplication,
  removePagesTestEnvironment,
} from './pages-test-helpers'

async function withCardApplication(
  prefix: string,
  run: (window: Page) => Promise<void>,
): Promise<void> {
  const environment = await createPagesTestEnvironment(prefix, [])
  try {
    const application = await launchPagesTestApplication(environment)
    try {
      await run(await application.firstWindow())
    }
    finally {
      await application.close()
    }
  }
  finally {
    await removePagesTestEnvironment(environment)
  }
}

async function createNoteEditor(window: Page, title: string): Promise<Locator> {
  await window.getByRole('link', { name: 'Journals' }).waitFor()
  await window.keyboard.press('Meta+P')
  await window.getByRole('combobox', { name: 'Search commands and Notes' }).fill(title)
  await window.getByRole('option').filter({ hasText: `Create Note “${title}”` }).click()

  const editor = window.getByRole('textbox', { name: 'Editor content' })
  const heading = editor.getByRole('heading', { name: title })
  await expect(heading).toBeVisible()
  await heading.click()
  await window.keyboard.press('End')
  await window.keyboard.press('Enter')
  return editor
}

function sourceBlock(editor: Locator, uniqueText: string): Locator {
  return editor.locator('[data-block-id]').filter({ hasText: uniqueText }).first()
}

async function visibleText(root: Locator): Promise<string> {
  return root.evaluate((element) => {
    if (!(element instanceof HTMLElement))
      throw new TypeError('Visible text root must be an HTMLElement')
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const chunks: string[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement
      if (!parent)
        throw new Error('Visible Card text node is missing its parent element')
      let current: Element | null = parent
      let visible = false
      while (current) {
        const style = getComputedStyle(current)
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse')
          break
        if (current instanceof HTMLElement && current.hidden)
          break
        if (current === element) {
          visible = true
          break
        }
        current = current.parentElement
      }
      if (visible)
        chunks.push(node.textContent ?? '')
    }
    return chunks.join(' ').replace(/\s+/g, ' ').trim()
  })
}

async function openPreview(source: Locator): Promise<Locator> {
  await source.hover()
  const button = source.getByRole('button', { name: 'Preview card' })
  await expect(button).toBeVisible()
  await button.click()
  const preview = source.page().getByRole('dialog', { name: 'Card preview' })
  await expect(preview).toBeVisible()
  return preview
}

async function expectDelimiter(
  surface: Locator,
  direction: 'backward' | 'both' | 'forward',
  symbol: '←' | '↔' | '→',
  multiline = false,
): Promise<void> {
  await expect(surface.locator('[data-card-delimiter]:visible')).toHaveCount(1)
  const delimiter = surface.locator('[data-card-review-source] [data-card-delimiter]')
  await expect(delimiter).toHaveCount(1)
  await expect(delimiter).toBeVisible()
  await expect(delimiter).toHaveAttribute('data-card-direction', direction)
  await expect(delimiter.locator('[data-card-direction-symbol]')).toHaveText(symbol)
  if (multiline) {
    await expect(delimiter).toHaveClass(/card-delimiter-multiline/)
    const transform = await delimiter.locator('[data-card-direction-symbol]').evaluate(element => getComputedStyle(element).transform)
    expect(transform).not.toBe('none')
    expect(transform).not.toBe('matrix(1, 0, 0, 1, 0, 0)')
  }
  else {
    await expect(delimiter).not.toHaveClass(/card-delimiter-multiline/)
  }
}

async function markEditorMount(surface: Locator, marker: string): Promise<void> {
  await surface.locator('.ProseMirror').evaluate((element, value) => {
    element.setAttribute('data-e2e-editor-mount', value)
  }, marker)
}

async function expectEditorMount(surface: Locator, marker: string): Promise<void> {
  await expect(surface.locator('.ProseMirror')).toHaveAttribute('data-e2e-editor-mount', marker)
}

async function convertToMultiLineCard(
  window: Page,
  editor: Locator,
  presentation: 'List answer' | 'Set answer',
  prompt: string,
  firstItem: string,
  secondItem: string,
): Promise<Locator> {
  await window.keyboard.type(`${prompt}:-> `)
  await window.keyboard.press('Enter')
  await window.keyboard.type(firstItem)
  await window.keyboard.press('Enter')
  await window.keyboard.type(secondItem)
  const source = sourceBlock(editor, prompt)
  const delimiter = source.locator('[data-card-delimiter]')
  await expect(delimiter).toHaveCount(1)
  const definitionId = await delimiter.getAttribute('data-card-definition-id')
  if (!definitionId)
    throw new Error(`${presentation} Card is missing its definition ID`)

  const members = source.locator(`[data-card-item-definition-id="${definitionId}"]`)
  await expect(members).toHaveCount(2)
  await source.hover()
  await source.getByRole('button', { name: 'Card options' }).click()
  await window.getByRole('button', { name: presentation }).click()
  return source
}

test('previews multi-line Basic Cards with forward, reverse, and bidirectional Editor delimiters', async () => {
  await withCardApplication('memorilo-card-directions-', async (window) => {
    const editor = await createNoteEditor(window, 'Card direction coverage')

    await window.keyboard.type('Forward question line one')
    await window.keyboard.press('Shift+Enter')
    await window.keyboard.type('Forward question line two:-> Forward answer line one')
    await window.keyboard.press('Shift+Enter')
    await window.keyboard.type('Forward answer line two')
    await window.keyboard.press('Enter')
    await window.keyboard.type('Reverse prompt:-< Reverse answer')
    await window.keyboard.press('Enter')
    await window.keyboard.type('Bidirectional prompt:<> Bidirectional answer')
    await expect(editor.locator('[data-card-delimiter]')).toHaveCount(3)

    const forwardPreview = await openPreview(sourceBlock(editor, 'Forward question line one'))
    const forwardSurface = forwardPreview.getByTestId('card-preview-surface')
    await expectDelimiter(forwardSurface, 'forward', '→')
    await markEditorMount(forwardSurface, 'forward-preview')
    expect(await visibleText(forwardSurface)).toContain('Forward question line one')
    expect(await visibleText(forwardSurface)).toContain('Forward question line two')
    expect(await visibleText(forwardSurface)).not.toContain('Forward answer line one')
    const questionBreakVisibility = await forwardSurface.locator('br:not(.ProseMirror-trailingBreak)').evaluateAll(elements => (
      elements.map(element => getComputedStyle(element).display !== 'none')
    ))
    expect(questionBreakVisibility).toEqual([true, false])
    await forwardPreview.getByRole('button', { name: 'Show answer' }).click()
    await expect(forwardSurface).toHaveAttribute('data-card-side', 'answer')
    expect(await visibleText(forwardSurface)).toContain('Forward answer line one')
    expect(await visibleText(forwardSurface)).toContain('Forward answer line two')
    await expectEditorMount(forwardSurface, 'forward-preview')
    await expectDelimiter(forwardSurface, 'forward', '→')
    await forwardPreview.getByRole('button', { name: 'Close preview' }).click()

    const reversePreview = await openPreview(sourceBlock(editor, 'Reverse prompt'))
    const reverseSurface = reversePreview.getByTestId('card-preview-surface')
    await expectDelimiter(reverseSurface, 'backward', '←')
    expect(await visibleText(reverseSurface)).toContain('Reverse answer')
    expect(await visibleText(reverseSurface)).not.toContain('Reverse prompt')
    await reversePreview.getByRole('button', { name: 'Show answer' }).click()
    expect(await visibleText(reverseSurface)).toContain('Reverse prompt')
    await expectDelimiter(reverseSurface, 'backward', '←')
    await reversePreview.getByRole('button', { name: 'Close preview' }).click()

    const bidirectionalPreview = await openPreview(sourceBlock(editor, 'Bidirectional prompt'))
    const bidirectionalSurface = bidirectionalPreview.getByTestId('card-preview-surface')
    await expectDelimiter(bidirectionalSurface, 'both', '↔')
    expect(await visibleText(bidirectionalSurface)).toContain('Bidirectional prompt')
    expect(await visibleText(bidirectionalSurface)).not.toContain('Bidirectional answer')
    await bidirectionalPreview.getByRole('button', { name: 'Preview reverse Card' }).click()
    expect(await visibleText(bidirectionalSurface)).toContain('Bidirectional answer')
    expect(await visibleText(bidirectionalSurface)).not.toContain('Bidirectional prompt')
    await expectDelimiter(bidirectionalSurface, 'both', '↔')
    await bidirectionalPreview.getByRole('button', { name: 'Show answer' }).click()
    expect(await visibleText(bidirectionalSurface)).toContain('Bidirectional prompt')
  })
})

test('previews a ListCard by revealing ordered items one at a time', async () => {
  await withCardApplication('memorilo-list-card-preview-', async (window) => {
    const editor = await createNoteEditor(window, 'ListCard coverage')
    const source = await convertToMultiLineCard(
      window,
      editor,
      'List answer',
      'First two planets',
      'Mercury',
      'Venus',
    )

    const preview = await openPreview(source)
    const surface = preview.getByTestId('card-preview-surface')
    await expectDelimiter(surface, 'forward', '→', true)
    await markEditorMount(surface, 'list-preview')
    expect(await visibleText(surface)).toContain('First two planets')
    expect(await visibleText(surface)).not.toContain('Mercury')
    expect(await visibleText(surface)).not.toContain('Venus')

    await preview.getByRole('button', { name: 'Show next item (1 of 2)' }).click()
    expect(await visibleText(surface)).toContain('Mercury')
    expect(await visibleText(surface)).not.toContain('Venus')
    await preview.getByRole('button', { name: 'Show next item (2 of 2)' }).click()
    const revealedText = await visibleText(surface)
    expect(revealedText.indexOf('Mercury')).toBeLessThan(revealedText.indexOf('Venus'))
    await expectEditorMount(surface, 'list-preview')
    await expectDelimiter(surface, 'forward', '→', true)
  })
})

test('previews a SetCard by revealing all unordered items together', async () => {
  await withCardApplication('memorilo-set-card-preview-', async (window) => {
    const editor = await createNoteEditor(window, 'SetCard coverage')
    const source = await convertToMultiLineCard(
      window,
      editor,
      'Set answer',
      'Primary colors',
      'Red',
      'Blue',
    )

    const preview = await openPreview(source)
    const surface = preview.getByTestId('card-preview-surface')
    await expectDelimiter(surface, 'forward', '→', true)
    await markEditorMount(surface, 'set-preview')
    expect(await visibleText(surface)).toContain('Primary colors')
    expect(await visibleText(surface)).not.toContain('Red')
    expect(await visibleText(surface)).not.toContain('Blue')

    await preview.getByRole('button', { name: 'Show answer' }).click()
    expect(await visibleText(surface)).toContain('Red')
    expect(await visibleText(surface)).toContain('Blue')
    await expectEditorMount(surface, 'set-preview')
    await expectDelimiter(surface, 'forward', '→', true)
  })
})

test('previews and reveals a Cloze Card through the real Editor workflow', async () => {
  await withCardApplication('memorilo-cloze-preview-', async (window) => {
    const editor = await createNoteEditor(window, 'Cloze coverage')
    await window.keyboard.type('The closest planet is Mercury.')
    await window.keyboard.press('ArrowLeft')
    await window.keyboard.down('Shift')
    for (let index = 0; index < 'Mercury'.length; index += 1)
      await window.keyboard.press('ArrowLeft')
    await window.keyboard.up('Shift')
    await window.getByTestId('inline-menu-main').getByRole('button', { exact: true, name: 'Cloze' }).click()

    const source = sourceBlock(editor, 'The closest planet')
    await expect(source.locator('[data-cloze-group-id]')).toHaveText('Mercury')
    const preview = await openPreview(source)
    const surface = preview.getByTestId('card-preview-surface')
    await markEditorMount(surface, 'cloze-preview')
    await expect(surface.getByLabel('Hidden cloze')).toBeVisible()
    expect(await visibleText(surface)).not.toContain('Mercury')
    await expect(surface.locator('[data-card-delimiter]')).toHaveCount(0)

    await preview.getByRole('button', { name: 'Show answer' }).click()
    await expect(surface.getByLabel('Hidden cloze')).toHaveCount(0)
    expect(await visibleText(surface)).toContain('Mercury')
    await expectEditorMount(surface, 'cloze-preview')
  })
})

test('keeps a multi-line Basic delimiter visible while moving from editing into Learning Review', async () => {
  await withCardApplication('memorilo-learning-review-card-', async (window) => {
    const title = 'Learning Review card coverage'
    const editor = await createNoteEditor(window, title)
    await window.keyboard.type('Review question line one')
    await window.keyboard.press('Shift+Enter')
    await window.keyboard.type('Review question line two:-> Review answer line one')
    await window.keyboard.press('Shift+Enter')
    await window.keyboard.type('Review answer line two')
    await expect(editor.locator('[data-card-delimiter]')).toHaveCount(1)

    await window.getByRole('link', { exact: true, name: 'Learning' }).click()
    await window.getByRole('link', { name: `Study ${title}` }).click()

    const surface = window.locator('[data-card-surface="review"]')
    await expect(surface).toHaveAttribute('data-card-side', 'question')
    await expectDelimiter(surface, 'forward', '→')
    await markEditorMount(surface, 'learning-review')
    expect(await visibleText(surface)).toContain('Review question line one')
    expect(await visibleText(surface)).toContain('Review question line two')
    expect(await visibleText(surface)).not.toContain('Review answer line one')

    await window.getByRole('button', { name: 'Show Answer' }).click()
    await expect(surface).toHaveAttribute('data-card-side', 'answer')
    expect(await visibleText(surface)).toContain('Review answer line one')
    expect(await visibleText(surface)).toContain('Review answer line two')
    await expectEditorMount(surface, 'learning-review')
    await expectDelimiter(surface, 'forward', '→')
  })
})
