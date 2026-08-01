import type { I18nTestContext } from './i18n-e2e-helpers'

import { expect, test } from '@playwright/test'
import {

  launchI18nApplication,
  removeI18nTestContext,
  updateConfiguration,
} from './i18n-e2e-helpers'

test.describe('localization in the packaged build', () => {
  let context: I18nTestContext

  test.afterEach(async () => {
    if (context)
      await removeI18nTestContext(context)
  })

  test('loads a language and switches it at runtime', async () => {
    context = await launchI18nApplication({ language: 'zh-CN' })
    const window = await context.electronApplication.firstWindow()

    // Chinese is loaded from the bundled locale resources.
    await expect(window.getByRole('link', { name: '日志' })).toBeVisible()
    await expect(window.getByRole('link', { name: '页面' })).toBeVisible()

    // Dynamically switching the configured language to English updates the UI.
    await updateConfiguration(context.userDataDirectory, { language: 'en' })
    await expect(window.getByRole('link', { name: 'Journals' })).toBeVisible()
    await expect(window.getByRole('link', { name: 'Pages' })).toBeVisible()

    // And back to Chinese.
    await updateConfiguration(context.userDataDirectory, { language: 'zh-CN' })
    await expect(window.getByRole('link', { name: '日志' })).toBeVisible()
  })
})
