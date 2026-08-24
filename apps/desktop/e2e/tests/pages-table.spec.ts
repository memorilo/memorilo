import type { ElectronApplication, Page } from '@playwright/test'

import { expect, test } from '@playwright/test'

import {
  createPagesTestEnvironment,
  launchPagesTestApplication,
  removePagesTestEnvironment,
} from './pages-test-helpers'

async function openPages(window: Page, expectedCount = '4 notes'): Promise<void> {
  await window.getByRole('button', { name: 'Hide Sidebar' }).waitFor()
  await window.getByRole('link', { name: 'Pages' }).click()
  await expect(window.getByText(expectedCount, { exact: true })).toBeVisible()
}

async function visibleTitles(window: Page): Promise<string[]> {
  return window.getByRole('button', { name: /^Rename Note:/ }).allTextContents()
}

async function expectTitleOrder(window: Page, titles: readonly string[]): Promise<void> {
  await expect.poll(() => visibleTitles(window)).toEqual(titles)
}

test('sorts Notes through each table header', async () => {
  const environment = await createPagesTestEnvironment('memorilo-pages-sort-', [
    { createdAt: 3_000, id: 'alpha-note', title: 'Alpha Note', updatedAt: 1_000 },
    { createdAt: 1_000, id: 'middle-note', title: 'Middle Note', updatedAt: 3_000 },
    { createdAt: 2_000, id: 'zulu-note', title: 'Zulu Note', updatedAt: 2_000 },
  ])
  let application: ElectronApplication | null = null
  try {
    application = await launchPagesTestApplication(environment)
    const window = await application.firstWindow()
    await openPages(window)

    const titleHeader = window.getByRole('button', { name: /^Sort by Title/ })
    await titleHeader.click()
    await expect(titleHeader).toHaveAccessibleName('Sort by Title, currently ascending')
    await expectTitleOrder(window, ['Alpha Note', 'Middle Note', 'Zulu Note'])
    await titleHeader.click()
    await expect(titleHeader).toHaveAccessibleName('Sort by Title, currently descending')
    await expectTitleOrder(window, ['Zulu Note', 'Middle Note', 'Alpha Note'])

    const createdHeader = window.getByRole('button', { name: /^Sort by Created/ })
    await createdHeader.click()
    await expect(createdHeader).toHaveAccessibleName('Sort by Created, currently descending')
    await expectTitleOrder(window, ['Alpha Note', 'Zulu Note', 'Middle Note'])
    await createdHeader.click()
    await expect(createdHeader).toHaveAccessibleName('Sort by Created, currently ascending')
    await expectTitleOrder(window, ['Middle Note', 'Zulu Note', 'Alpha Note'])

    const modifiedHeader = window.getByRole('button', { name: /^Sort by Modified/ })
    await modifiedHeader.click()
    await expect(modifiedHeader).toHaveAccessibleName('Sort by Modified, currently descending')
    await expectTitleOrder(window, ['Middle Note', 'Zulu Note', 'Alpha Note'])
    await modifiedHeader.click()
    await expect(modifiedHeader).toHaveAccessibleName('Sort by Modified, currently ascending')
    await expectTitleOrder(window, ['Alpha Note', 'Zulu Note', 'Middle Note'])
  }
  finally {
    if (application)
      await application.close()
    await removePagesTestEnvironment(environment)
  }
})

test('renames a Note through the table and keeps the title after restart', async () => {
  const environment = await createPagesTestEnvironment('memorilo-pages-rename-', [
    { createdAt: 1_000, id: 'renamed-note', title: 'Original Note', updatedAt: 1_000 },
  ])
  let application: ElectronApplication | null = null
  try {
    application = await launchPagesTestApplication(environment)
    let window = await application.firstWindow()
    await window.getByRole('button', { name: 'Hide Sidebar' }).waitFor()
    await window.getByRole('link', { name: 'Pages' }).click()
    await window.getByRole('button', { name: 'Rename Note: Original Note' }).click()

    const titleInput = window.getByRole('textbox', { name: 'Title for Original Note' })
    await titleInput.fill('Renamed Note')
    await titleInput.press('Enter')
    await expect(window.getByRole('button', { name: 'Rename Note: Renamed Note' })).toBeVisible()

    await application.close()
    application = null

    application = await launchPagesTestApplication(environment)
    window = await application.firstWindow()
    await window.getByRole('button', { name: 'Hide Sidebar' }).waitFor()
    await window.getByRole('link', { name: 'Pages' }).click()
    await expect(window.getByRole('button', { name: 'Rename Note: Renamed Note' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Rename Note: Original Note' })).toHaveCount(0)
  }
  finally {
    if (application)
      await application.close()
    await removePagesTestEnvironment(environment)
  }
})

test('rejects a duplicate Note title through table rename', async () => {
  const environment = await createPagesTestEnvironment('memorilo-pages-duplicate-title-', [
    { createdAt: 1_000, id: 'alpha-note', title: 'Alpha Note', updatedAt: 1_000 },
    { createdAt: 2_000, id: 'beta-note', title: 'Beta Note', updatedAt: 2_000 },
  ])
  let application: ElectronApplication | null = null
  try {
    application = await launchPagesTestApplication(environment)
    let window = await application.firstWindow()
    await openPages(window, '3 notes')
    await window.getByRole('button', { name: 'Rename Note: Alpha Note' }).click()

    const titleInput = window.getByRole('textbox', { name: 'Title for Alpha Note' })
    await titleInput.fill('Beta Note')
    await titleInput.press('Enter')
    const duplicateInput = window.getByRole('textbox', { name: 'A Note with this title already exists' })
    await expect(duplicateInput).toHaveValue('Beta Note')

    await duplicateInput.press('Escape')
    await expect(window.getByRole('button', { name: 'Rename Note: Alpha Note' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Rename Note: Beta Note' })).toHaveCount(1)

    await application.close()
    application = null

    application = await launchPagesTestApplication(environment)
    window = await application.firstWindow()
    await openPages(window, '3 notes')
    await expect(window.getByRole('button', { name: 'Rename Note: Alpha Note' })).toBeVisible()
    await expect(window.getByRole('button', { name: 'Rename Note: Beta Note' })).toHaveCount(1)
  }
  finally {
    if (application)
      await application.close()
    await removePagesTestEnvironment(environment)
  }
})
