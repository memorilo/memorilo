import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { _electron as electron, expect, test } from '@playwright/test'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktopDirectory = resolve(repositoryRoot, 'apps/desktop')
const electronModule: unknown = createRequire(import.meta.url)('electron')
if (typeof electronModule !== 'string')
  throw new TypeError('Electron package did not resolve to an executable path')
const electronExecutablePath = electronModule

test('creates a Note with an H1 first line from an unmatched search', async () => {
  const userDataDirectory = await mkdtemp(resolve(tmpdir(), 'memorilo-command-palette-create-'))
  try {
    const electronApplication = await electron.launch({
      args: [desktopDirectory, `--user-data-dir=${userDataDirectory}`],
      cwd: repositoryRoot,
      env: {
        ...process.env,
        MEMORILO_DATABASE_PATH: ':memory:',
        MEMORILO_EMBEDDING_MODEL_OFFLINE: '1',
      },
      executablePath: electronExecutablePath,
    })
    try {
      const window = await electronApplication.firstWindow()
      const title = 'Distributed garden planning 5e812c'

      await window.getByRole('link', { name: 'Journals' }).waitFor()
      await window.keyboard.press('Meta+P')
      await window.getByRole('combobox', { name: 'Search commands and Notes' }).fill(title)
      const createResult = window.getByRole('option').filter({ hasText: `Create Note “${title}”` })
      await expect(createResult).toHaveCount(1)
      await createResult.click()

      await expect(window.getByRole('button', { name: `Rename Note: ${title}` })).toBeVisible()
      await expect.poll(() => window.evaluate(() => globalThis.location.hash)).toMatch(/^#\/note\/[^/]+\/[^/?]+$/)
      const editor = window.getByRole('textbox', { name: 'Editor content' })
      await expect(editor.locator('h1').first()).toHaveText(title)
      await expect(editor.locator('[data-block-id]').first()).toHaveText(title)
    }
    finally {
      await electronApplication.close()
    }
  }
  finally {
    await rm(userDataDirectory, { force: true, recursive: true })
  }
})
