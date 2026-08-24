import type { ElectronApplication, Page } from '@playwright/test'
import type Database from 'better-sqlite3'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { _electron as electron, expect, test } from '@playwright/test'
import BetterSqlite3 from 'better-sqlite3'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const desktopDirectory = resolve(repositoryRoot, 'apps/desktop')
const electronModule: unknown = createRequire(import.meta.url)('electron')
if (typeof electronModule !== 'string')
  throw new TypeError('Electron package did not resolve to an executable path')
const electronExecutablePath = electronModule
const legacyLibraryStorageKey = 'memorilo.whiteboard.library.v1'
const legacyLibraryValue = JSON.stringify({ libraryItems: [], schemaVersion: 1 })

interface UserDocumentRow {
  snapshot: Uint8Array
}

function launchApplication(databasePath: string, userDataDirectory: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [desktopDirectory, `--user-data-dir=${userDataDirectory}`],
    cwd: repositoryRoot,
    env: {
      ...process.env,
      MEMORILO_DATABASE_PATH: databasePath,
      MEMORILO_EMBEDDING_MODEL_OFFLINE: '1',
      MEMORILO_E2E_HIDE_WINDOW: process.env.MEMORILO_E2E_HIDE_WINDOW ?? '1',
      MEMORILO_SHELF_IMAGE_CACHE_PATH: ':memory:',
    },
    executablePath: electronExecutablePath,
  })
}

function readLibrarySnapshot(databasePath: string): Uint8Array {
  const database: Database.Database = new BetterSqlite3(databasePath, { readonly: true })
  try {
    const row = database.prepare(`
      SELECT snapshot
      FROM user_documents
      WHERE document_id = 'whiteboard-library'
    `).get() as UserDocumentRow | undefined
    if (!row)
      throw new Error('Whiteboard Library user document is missing')
    return new Uint8Array(row.snapshot)
  }
  finally {
    database.close()
  }
}

async function waitForApplication(window: Page) {
  await expect.poll(async () => (
    await window.getByRole('link', { name: 'Journals' }).isVisible()
    || await window.getByRole('button', { name: 'Show sidebar' }).isVisible()
  )).toBe(true)
}

async function createWhiteboard(window: Page, noteTitle: string, whiteboardTitle: string) {
  await window.keyboard.press('Meta+P')
  const commandSearch = window.getByRole('combobox', { name: 'Search commands and Notes' })
  await expect(commandSearch).toBeVisible()
  await commandSearch.fill(noteTitle)
  await window.getByRole('option').filter({ hasText: `Create Note “${noteTitle}”` }).click()

  const inspectorHeading = window.getByRole('heading', { name: 'Note Structure' })
  const showInspector = window.getByRole('button', { name: 'Show Note Inspector' })
  await expect.poll(async () => (
    await inspectorHeading.isVisible() || await showInspector.isVisible()
  )).toBe(true)
  if (!await inspectorHeading.isVisible())
    await showInspector.click()

  await expect(inspectorHeading).toBeVisible()
  await inspectorHeading.click({ button: 'right' })
  await window.getByRole('menuitem', { name: 'Add' }).click()
  await window.getByRole('menuitem', { name: 'Whiteboard' }).click()
  const dialog = window.getByRole('dialog', { name: 'New Whiteboard' })
  await dialog.getByRole('textbox', { name: 'Topic title' }).fill(whiteboardTitle)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await window.getByRole('link', { name: whiteboardTitle }).click()

  const hideInspector = window.getByRole('button', { name: 'Hide Note Inspector' })
  if (await hideInspector.isVisible())
    await hideInspector.click()
  await window.getByTitle(/^Rectangle/).waitFor()
}

function libraryTrigger(window: Page) {
  return window.locator('label.sidebar-trigger__label-element[title="Library"] .sidebar-trigger')
}

async function openLibrary(window: Page) {
  const checkbox = window.getByRole('checkbox', { name: 'Library' })
  if (!await checkbox.isChecked())
    await libraryTrigger(window).click()
}

async function addRectangleToLibrary(window: Page) {
  const interactiveCanvas = window.locator('canvas.interactive')
  const canvasBounds = await interactiveCanvas.boundingBox()
  if (!canvasBounds)
    throw new Error('Whiteboard interactive canvas has no layout bounds')

  await window.getByTitle(/^Rectangle/).click()
  await window.mouse.move(canvasBounds.x + 250, canvasBounds.y + 180)
  await window.mouse.down()
  await window.mouse.move(canvasBounds.x + 430, canvasBounds.y + 300, { steps: 12 })
  await window.mouse.up()
  await openLibrary(window)

  const pendingLibraryItem = window.locator('.library-unit').filter({
    has: window.locator('.library-unit__adder'),
  })
  await expect(pendingLibraryItem).toHaveCount(1)
  await pendingLibraryItem.locator('.library-unit__dragger').click()
  await expectSavedLibraryItem(window)
}

async function expectSavedLibraryItem(window: Page) {
  await openLibrary(window)
  const savedLibraryItems = window.locator('.library-unit.library-unit__active').filter({
    hasNot: window.locator('.library-unit__adder'),
  })
  await expect(savedLibraryItems).toHaveCount(1)
  await expect(savedLibraryItems.locator('.library-unit__dragger')).toBeVisible()
}

test('persists the user Whiteboard Library as a global Loro document', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'memorilo-whiteboard-library-'))
  const databasePath = resolve(directory, 'memorilo.sqlite')
  const userDataDirectory = resolve(directory, 'user-data')
  let application: ElectronApplication | null = null

  try {
    application = await launchApplication(databasePath, userDataDirectory)
    let window = await application.firstWindow()
    await waitForApplication(window)
    const initializedSnapshot = readLibrarySnapshot(databasePath)
    expect(initializedSnapshot.byteLength).toBeGreaterThan(0)

    await window.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
      key: legacyLibraryStorageKey,
      value: legacyLibraryValue,
    })
    await createWhiteboard(window, 'Library source note', 'Library source board')
    await addRectangleToLibrary(window)

    await expect.poll(() => Array.from(readLibrarySnapshot(databasePath))).not.toEqual(
      Array.from(initializedSnapshot),
    )
    await expect(window.evaluate(key => window.localStorage.getItem(key), legacyLibraryStorageKey)).resolves.toBe(
      legacyLibraryValue,
    )

    await createWhiteboard(window, 'Library destination note', 'Library destination board')
    await expectSavedLibraryItem(window)

    await application.close()
    application = await launchApplication(databasePath, userDataDirectory)
    window = await application.firstWindow()
    await waitForApplication(window)
    await createWhiteboard(window, 'Library restart note', 'Library restart board')
    await expectSavedLibraryItem(window)
    await expect(window.evaluate(key => window.localStorage.getItem(key), legacyLibraryStorageKey)).resolves.toBe(
      legacyLibraryValue,
    )
  }
  finally {
    await application?.close()
    await rm(directory, { force: true, recursive: true })
  }
})
