import type { DevServerProcess, I18nTestContext } from './i18n-e2e-helpers'
import { readFile, writeFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'
import {

  launchI18nApplication,
  LOCALE_APP_ZH_PATH,
  removeI18nTestContext,
  startRendererDevServer,
  updateConfiguration,
} from './i18n-e2e-helpers'

const HMR_JOURNALS_MARKER = '日志-HMR'

test.describe('localization in the renderer dev server', () => {
  let context: I18nTestContext
  let devServer: DevServerProcess

  test.beforeAll(async () => {
    devServer = await startRendererDevServer()
  })

  test.afterAll(async () => {
    devServer?.child.kill()
  })

  test.afterEach(async () => {
    await restoreJournalTranslation()
    if (context)
      await removeI18nTestContext(context)
  })

  test('loads a language, switches it at runtime, and hot-reloads locale edits', async () => {
    context = await launchI18nApplication({ language: 'zh-CN' }, {
      rendererUrl: devServer.url,
    })
    const window = await context.electronApplication.firstWindow()
    window.on('console', message => console.error('[DEBUG-memorilo-hono-dev] console', message.type(), message.text()))
    window.on('pageerror', error => console.error('[DEBUG-memorilo-hono-dev] pageerror', error))
    window.on('requestfailed', request => console.error(
      '[DEBUG-memorilo-hono-dev] requestfailed',
      request.method(),
      request.url(),
      request.failure()?.errorText,
    ))

    // First boot from the Vite dev server transforms and serves many modules, so give
    // the renderer generous time to become ready.
    await expect(window.getByRole('link', { name: '日志' })).toBeVisible({ timeout: 30_000 })
    await expect(window.getByRole('link', { name: '页面' })).toBeVisible({ timeout: 30_000 })

    // Dynamically switching the configured language to English updates the UI.
    await updateConfiguration(context.userDataDirectory, { language: 'en' })
    await expect(window.getByRole('link', { name: 'Journals' })).toBeVisible()
    await expect(window.getByRole('link', { name: 'Pages' })).toBeVisible()

    // Back to Chinese for the hot-reload check.
    await updateConfiguration(context.userDataDirectory, { language: 'zh-CN' })
    await expect(window.getByRole('link', { name: '日志' })).toBeVisible()

    // Mark the page so we can prove a locale edit applies via HMR: a full page
    // reload would wipe this marker from the window.
    const markerToken = `hmr-${Date.now()}`
    await window.evaluate((token: string) => {
      (window as unknown as { __memoriloHmrMarker?: string }).__memoriloHmrMarker = token
    }, markerToken)

    // Edit the zh locale file. The running app should adopt it without a full reload.
    await writeFile(LOCALE_APP_ZH_PATH, await localizedJournalContent(HMR_JOURNALS_MARKER), 'utf8')

    await expect(window.getByRole('link', { name: HMR_JOURNALS_MARKER })).toBeVisible({ timeout: 30_000 })

    // The marker survived, so the edit applied as an in-place hot update.
    const markerAfter = await window.evaluate(() =>
      (window as unknown as { __memoriloHmrMarker?: string }).__memoriloHmrMarker)
    expect(markerAfter).toBe(markerToken)

    // The previous translation is gone, so the bundle was replaced rather than merged.
    // `exact: true` distinguishes the old exact label from the new "日志-HMR" (which
    // contains "日志" as a substring).
    await expect(window.getByRole('link', { name: '日志', exact: true })).toHaveCount(0)
  })
})

async function localizedJournalContent(translation: string): Promise<string> {
  // Substitute only the `journals` value so the rest of the file (including array
  // formatting) is preserved and the working tree stays clean after the test.
  const original = await readFile(LOCALE_APP_ZH_PATH, 'utf8')
  return original.replace(/"journals"\s*:\s*"([^"]*)"/, `"journals": "${translation}"`)
}

async function restoreJournalTranslation(): Promise<void> {
  const original = await readFile(LOCALE_APP_ZH_PATH, 'utf8')
  if (!/"journals"\s*:\s*"日志-HMR"/.test(original))
    return
  await writeFile(LOCALE_APP_ZH_PATH, original.replace(/"journals"\s*:\s*"日志-HMR"/, '"journals": "日志"'), 'utf8')
}
