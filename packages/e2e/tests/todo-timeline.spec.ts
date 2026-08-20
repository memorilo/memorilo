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

test('switches between schedule and timeline views', async () => {
  const userDataDirectory = await mkdtemp(resolve(tmpdir(), 'memorilo-todo-timeline-'))
  const electronApplication = await electron.launch({
    args: [desktopDirectory, `--user-data-dir=${userDataDirectory}`],
    cwd: repositoryRoot,
    env: {
      ...process.env,
      MEMORILO_DATABASE_PATH: ':memory:',
      MEMORILO_EMBEDDING_MODEL_OFFLINE: '1',
      MEMORILO_E2E_HIDE_WINDOW: '1',
      MEMORILO_SHELF_IMAGE_CACHE_PATH: ':memory:',
    },
    executablePath: electronExecutablePath,
  })
  try {
    const window = await electronApplication.firstWindow()
    await window.getByRole('link', { name: 'Todo', exact: true }).click()

    const scheduleButton = window.getByRole('button', { name: 'Switch to schedule view' })
    const timelineButton = window.getByRole('button', { name: 'Switch to timeline view' })

    await scheduleButton.click()
    await expect.poll(() => window.evaluate(() => globalThis.location.hash)).toBe('#/todo?view=agenda')
    await timelineButton.click()
    await expect.poll(() => window.evaluate(() => globalThis.location.hash)).toBe('#/todo?view=timeline')
    await window.locator('[data-todo-time-grid-calendar]').waitFor()
  }
  finally {
    await electronApplication.close()
    await rm(userDataDirectory, { force: true, recursive: true })
  }
})
