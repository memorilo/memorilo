import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { _electron as electron, expect, test } from '@playwright/test'

const packageRoot = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const executablePath = path.resolve(packageRoot, '../../apps/desktop/dist/win-unpacked/memorilo.exe')
const electronEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[0] !== 'ELECTRON_RUN_AS_NODE' && entry[1] !== undefined,
  ),
)

test('opens the packaged desktop workflow', async () => {
  const app = await electron.launch({ env: electronEnvironment, executablePath })
  const page = await app.firstWindow()
  const consoleErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error')
      consoleErrors.push(message.text())
  })

  await expect(page.getByRole('heading', { name: 'Runtime' })).toBeVisible()
  await expect(page.getByTestId('runtime-version')).toContainText('43.')

  await page.getByRole('link', { name: 'Editor' }).click()
  await expect(page.locator('[contenteditable="true"]')).toBeVisible()

  await page.getByRole('link', { name: 'Library' }).click()
  await expect(page.getByText('Memory 1', { exact: true })).toBeVisible()

  expect(consoleErrors).toEqual([])
  await app.close()
})
