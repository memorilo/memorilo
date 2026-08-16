import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  createPagesTestEnvironment,
  launchPagesTestApplication,
  removePagesTestEnvironment,
} from './pages-test-helpers'

async function createEditedNote(window: Page, title: string, text: string): Promise<void> {
  await window.getByRole('link', { name: 'Journals' }).waitFor()
  await window.keyboard.press('Meta+P')
  await window.getByRole('combobox', { name: 'Search commands and Notes' }).fill(title)
  await window.getByRole('option').filter({ hasText: `Create Note “${title}”` }).click()
  const editor = window.getByRole('textbox', { name: 'Editor content' })
  await expect(editor.locator('h1').first()).toHaveText(title)
  await editor.locator('h1').first().click()
  await window.keyboard.press('Meta+A')
  await window.keyboard.insertText(text.trim())
  await expect(editor).toContainText(text.trim())
}

async function assertPersisted(environment: Awaited<ReturnType<typeof createPagesTestEnvironment>>, text: string): Promise<void> {
  const relaunched = await launchPagesTestApplication(environment)
  try {
    const window = await relaunched.firstWindow()
    const recentNote = window.getByRole('link', { name: /persistence/ }).last()
    await expect(recentNote).toBeVisible()
    await recentNote.click()
    const editor = window.getByRole('textbox', { name: 'Editor content' })
    await expect(editor.locator('h1').first()).toContainText(text)
  }
  finally {
    await relaunched.close()
  }
}

test('persists an edit made immediately before the native window closes', async () => {
  const environment = await createPagesTestEnvironment('memorilo-window-close-save-', [])
  try {
    const application = await launchPagesTestApplication(environment)
    const window = await application.firstWindow()
    await createEditedNote(window, 'Window close persistence', ' saved-before-close')
    const closed = window.waitForEvent('close')
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
    await closed
    await application.close()

    await assertPersisted(environment, 'saved-before-close')
  }
  finally {
    await removePagesTestEnvironment(environment)
  }
})

test('persists an edit across route navigation before the debounce expires', async () => {
  const environment = await createPagesTestEnvironment('memorilo-route-save-', [])
  try {
    const application = await launchPagesTestApplication(environment)
    const window = await application.firstWindow()
    await createEditedNote(window, 'Route persistence', 'saved-before-navigation')
    await window.getByRole('link', { name: 'Pages' }).click()
    await expect(window.getByRole('main', { name: 'Pages' })).toBeVisible()
    await new Promise(resolve => setTimeout(resolve, 300))
    await application.close()

    await assertPersisted(environment, 'saved-before-navigation')
  }
  finally {
    await removePagesTestEnvironment(environment)
  }
})

test('persists an edit made immediately before application quit', async () => {
  const environment = await createPagesTestEnvironment('memorilo-quit-save-', [])
  try {
    const application = await launchPagesTestApplication(environment)
    const window = await application.firstWindow()
    await window.getByRole('link', { name: 'Journals' }).waitFor()
    const title = 'Application quit persistence'
    await window.keyboard.press('Meta+P')
    await window.getByRole('combobox', { name: 'Search commands and Notes' }).fill(title)
    await window.getByRole('option').filter({ hasText: `Create Note “${title}”` }).click()
    const heading = window.getByRole('textbox', { name: 'Editor content' }).locator('h1').first()
    await expect(heading).toHaveText(title)
    const editor = window.getByRole('textbox', { name: 'Editor content' })
    await heading.click()
    await window.keyboard.press('Meta+A')
    await window.keyboard.insertText('saved-before-quit')
    await expect(editor).toContainText('saved-before-quit')

    await application.evaluate(({ app }) => app.quit())
    const applicationProcess = application.process()
    await new Promise<void>((resolve) => {
      if (applicationProcess.exitCode !== null)
        resolve()
      else
        applicationProcess.once('exit', () => resolve())
    })

    await assertPersisted(environment, 'saved-before-quit')
  }
  finally {
    await removePagesTestEnvironment(environment)
  }
})
