import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { focusParagraph } from '../editor-test-utils'

export async function gotoSlashFixture(page: Page) {
  await page.goto('slash/index.html')
  await expect(page.getByTestId('slash-editor')).toBeVisible()
  await page.waitForSelector('[data-testid="slash-editor"] .ProseMirror p', { state: 'visible' })
}

export async function readSlashXmlSnapshot(page: Page) {
  const text = await page.getByTestId('slash-json').textContent()
  if (text === null) {
    throw new Error('Slash fixture snapshot is unavailable')
  }

  return JSON.parse(text) as string
}

export async function focusSlashParagraph(
  page: Page,
  index: number,
  edge: 'start' | 'end' = 'end',
) {
  await focusParagraph(page, 'slash-editor', index, edge)
}

export function getSlashMenu(page: Page) {
  return page.locator('.slash-menu-floating')
}

export function getSlashCommand(page: Page, commandId: string) {
  return page.locator(`[data-slash-command-id="${commandId}"]`)
}
