import { expect, test } from '@playwright/test'
import {
  focusSlashParagraph,
  getSlashCommand,
  getSlashMenu,
  gotoSlashFixture,
  readSlashXmlSnapshot,
} from './slash-test-utils'

test.describe('slash command integration', () => {
  test.beforeEach(async ({ page }) => {
    await gotoSlashFixture(page)
  })

  test('opens the slash menu and turns the current block into a heading', async ({ page }) => {
    await focusSlashParagraph(page, 0, 'start')
    await page.keyboard.type('/h2')

    await expect(getSlashMenu(page)).toBeVisible()
    await expect(getSlashCommand(page, 'heading-2')).toBeVisible()

    await page.keyboard.press('Enter')
    await page.keyboard.type('Launch plan')

    await expect(page.locator('[data-testid="slash-editor"] .ProseMirror h2')).toHaveText('Launch plan')
    await expect(page.locator('[data-testid="slash-editor"] .ProseMirror')).not.toContainText('/h2')
  })

  test('converts the current outline item into a task item from slash commands', async ({ page }) => {
    await focusSlashParagraph(page, 0, 'start')
    await page.keyboard.type('/todo')

    await expect(getSlashMenu(page)).toBeVisible()
    await expect(getSlashCommand(page, 'task-list')).toBeVisible()

    await page.keyboard.press('Enter')
    await page.keyboard.type('Ship slash menu')

    await expect.poll(async () => {
      return await readSlashXmlSnapshot(page)
    }).toBe('<outlineulist><outlinetaskitem status="todo"><paragraph>Ship slash menu</paragraph></outlinetaskitem></outlineulist>')
    await expect(page.locator('[data-testid="slash-editor"] .ProseMirror')).not.toContainText('/todo')
  })

  test('inserts a table from slash commands and keeps focus in the first cell', async ({ page }) => {
    await focusSlashParagraph(page, 0, 'start')
    await page.keyboard.type('/table')

    await expect(getSlashMenu(page)).toBeVisible()
    await expect(getSlashCommand(page, 'table')).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(page.locator('[data-testid="slash-editor"] .ProseMirror table')).toHaveCount(1)

    await page.keyboard.type('Cell A1')

    await expect(page.locator('[data-testid="slash-editor"] .ProseMirror table th').first()).toHaveText('Cell A1')
  })
})
