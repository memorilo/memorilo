import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  createPagesTestEnvironment,
  launchPagesTestApplication,
  removePagesTestEnvironment,
} from './pages-test-helpers'

type RpcValue = unknown

async function rpc(window: Page, method: string, args: readonly RpcValue[] = []): Promise<any> {
  return window.evaluate(async ({ args: requestArgs, method: requestMethod }) => {
    const response = await fetch(`memorilo://api/rpc/learning/${requestMethod}`, {
      body: JSON.stringify({ args: requestArgs }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    if (!response.ok)
      throw new Error(`Learning RPC ${requestMethod} failed with status ${response.status}`)
    return response.json()
  }, { args, method })
}

async function createHighlightedNote(window: Page, title: string): Promise<void> {
  await window.getByRole('link', { name: 'Journals' }).waitFor()
  await window.keyboard.press('Meta+P')
  await window.getByRole('combobox', { name: 'Search commands and Notes' }).fill(title)
  await window.getByRole('option').filter({ hasText: `Create Note “${title}”` }).click()

  const editor = window.getByRole('textbox', { name: 'Editor content' })
  const initialBlock = editor.locator('[data-block-id]').first()
  await expect(initialBlock).toBeVisible()
  await initialBlock.click()
  await window.keyboard.press('End')
  await window.keyboard.press('Enter')
  await window.keyboard.type('Incremental learning keeps source notes editable.')

  const sourceBlock = editor.locator('[data-block-id]').last()
  await sourceBlock.evaluate((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()
    if (!(text instanceof Text))
      throw new Error('Learning source Block has no text node')
    const selection = document.getSelection()
    if (!selection)
      throw new Error('Learning source selection is unavailable')
    const range = document.createRange()
    range.selectNodeContents(text)
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await expect(window.getByTestId('inline-menu-main')).toBeVisible()
  await window.getByTestId('inline-menu-main').getByRole('button', { exact: true, name: 'Highlight' }).click()
  await expect(sourceBlock.locator('[data-inline-highlight="yellow"]')).toHaveText('Incremental learning keeps source notes editable.')
}

async function openIncrementalLearning(window: Page): Promise<void> {
  await window.getByRole('link', { exact: true, name: 'Learning' }).click()
  await window.getByRole('link', { name: 'Study all Notes' }).click()
  await expect(window.getByRole('main', { name: 'Incremental learning' })).toBeVisible()
}

test('runs a Highlight Reading Item through the editable Learning workspace', async () => {
  const environment = await createPagesTestEnvironment('memorilo-learning-incremental-', [])
  try {
    const application = await launchPagesTestApplication(environment)
    try {
      const window = await application.firstWindow()
      const title = 'Incremental Learning E2E 8adf2d'
      await createHighlightedNote(window, title)

      await expect.poll(async () => (await rpc(window, 'listReadingItems', [{ includeScheduled: true }])).length).toBe(1)
      await openIncrementalLearning(window)

      const workspace = window.getByRole('main', { name: 'Incremental learning' })
      await expect(workspace.getByRole('complementary', { name: 'Note Structure' })).toBeVisible()
      await expect(workspace.getByRole('button', { name: 'Make Card' })).toBeVisible()
      await expect(workspace.getByRole('button', { name: 'Next' })).toBeVisible()
      await expect(workspace.locator('[data-inline-highlight="yellow"]')).toHaveText('Incremental learning keeps source notes editable.')
      await expect(workspace.getByLabel('Learning source')).toBeVisible()

      await workspace.getByRole('button', { name: 'Make Card' }).click()
      await expect(workspace.getByRole('button', { name: 'Card created' })).toBeDisabled()
      await expect.poll(async () => {
        const notes = await rpc(window, 'listNotesWithCards') as Array<{ cardCount: number, noteTitle: string }>
        return notes.find(note => note.noteTitle === title)?.cardCount ?? 0
      }).toBe(1)

      const readingItemBeforeNext = (await rpc(window, 'listReadingItems', [{ includeScheduled: true }]))[0]
      await workspace.getByRole('button', { name: 'Next' }).click()
      await expect.poll(async () => (await rpc(window, 'listReadingItems', [{ includeScheduled: true }]))[0]?.state).toBe('learning')
      await expect.poll(async () => await rpc(window, 'getNextLearningKind', [{ now: Date.now() }])).toBe('review')
      const readingItemAfterNext = (await rpc(window, 'listReadingItems', [{ includeScheduled: true }]))[0]
      expect(readingItemAfterNext.state).toBe('learning')
      expect(readingItemAfterNext.nextProcessAt).toBeGreaterThan(readingItemBeforeNext.nextProcessAt ?? 0)
    }
    finally {
      await application.close()
    }
  }
  finally {
    await removePagesTestEnvironment(environment)
  }
})
