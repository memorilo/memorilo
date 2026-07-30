import type { ElectronApplication } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  createPagesTestEnvironment,
  launchPagesTestApplication,
  removePagesTestEnvironment,
} from './pages-test-helpers'

test('loads the next Note page when the virtual list reaches its end', async () => {
  const environment = await createPagesTestEnvironment(
    'memorilo-pages-scroll-',
    Array.from({ length: 130 }, (_, index) => ({
      createdAt: index,
      id: `page-${index.toString().padStart(3, '0')}`,
      title: `Page ${index.toString().padStart(3, '0')}`,
      updatedAt: index,
    })),
  )
  let electronApplication: ElectronApplication | null = null
  try {
    electronApplication = await launchPagesTestApplication(environment)
    const window = await electronApplication.firstWindow()
    await window.getByRole('button', { name: 'Hide Sidebar' }).waitFor()
    await window.getByRole('link', { name: 'Pages' }).click()
    await window.getByRole('button', { name: /^Sort by Title/ }).click()
    await expect(window.getByRole('button', { name: 'Rename Note: Page 000' })).toBeVisible()

    await window.getByRole('table').hover()
    await window.mouse.wheel(0, 10_000)
    await expect(window.getByRole('button', { name: 'Rename Note: Page 100' })).toBeVisible()

    await window.mouse.wheel(0, 10_000)
    await expect(window.getByRole('button', { name: 'Rename Note: Page 129' })).toBeVisible()
  }
  finally {
    if (electronApplication)
      await electronApplication.close()
    await removePagesTestEnvironment(environment)
  }
})
