import type { ElectronApplication } from '@playwright/test'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test } from '@playwright/test'
import Database from 'better-sqlite3'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktopDirectory = resolve(repositoryRoot, 'apps/desktop')
const electronModule: unknown = createRequire(import.meta.url)('electron')
if (typeof electronModule !== 'string')
  throw new TypeError('Electron package did not resolve to an executable path')
const electronExecutablePath = electronModule

function launchApplication(databasePath: string, userDataDirectory: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [desktopDirectory, `--user-data-dir=${userDataDirectory}`],
    cwd: repositoryRoot,
    env: {
      ...process.env,
      MEMORILO_DATABASE_PATH: databasePath,
      MEMORILO_EMBEDDING_MODEL_OFFLINE: '1',
      MEMORILO_E2E_HIDE_WINDOW: '1',
      MEMORILO_SHELF_IMAGE_CACHE_PATH: ':memory:',
    },
    executablePath: electronExecutablePath,
  })
}

interface PersistedSpreadsheetProjection {
  cells: readonly { display: string, input: string }[]
  sheetCount: number
}

function readPersistedSpreadsheet(
  databasePath: string,
  noteTitle: string,
): PersistedSpreadsheetProjection {
  const database = new Database(databasePath, { readonly: true })
  try {
    const cells = database.prepare(`
      SELECT cell.input, cell.display
      FROM spreadsheet_cells AS cell
      INNER JOIN notes AS note ON note.row_id = cell.note_row_id
      WHERE note.title = ?
      ORDER BY cell.input
    `).all(noteTitle) as { display: string, input: string }[]
    const count = database.prepare(`
      SELECT COUNT(*) AS value
      FROM spreadsheet_sheets AS sheet
      INNER JOIN notes AS note ON note.row_id = sheet.note_row_id
      WHERE note.title = ?
    `).get(noteTitle) as { value: number } | undefined
    if (!count)
      throw new Error(`Could not count persisted Sheets for Note ${noteTitle}`)
    return { cells, sheetCount: count.value }
  }
  finally {
    database.close()
  }
}

test('creates, edits, persists, and reloads a SpreadsheetTopic without title or lock chrome', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'memorilo-spreadsheet-topic-'))
  const databasePath = resolve(directory, 'memorilo.sqlite')
  const noteTitle = 'Spreadsheet persistence'
  const expectedProjection: PersistedSpreadsheetProjection = {
    cells: [
      { display: '21', input: '21' },
      { display: '42', input: '=A1*2' },
    ],
    sheetCount: 2,
  }
  try {
    const application = await launchApplication(databasePath, directory)
    let persisted = false
    let noteHash: string | null = null
    try {
      const window = await application.firstWindow()
      const spreadsheetTitle = 'Budget'

      await window.getByRole('link', { name: 'Journals' }).waitFor()
      await window.keyboard.press('Meta+P')
      await window.getByRole('combobox', { name: 'Search commands and Notes' }).fill(noteTitle)
      await window.getByRole('option').filter({ hasText: `Create Note “${noteTitle}”` }).click()
      await window.getByRole('button', { name: 'Show Note Inspector' }).click()
      await window.getByRole('heading', { name: 'Note Structure' }).click({ button: 'right' })
      await window.getByRole('menuitem', { name: 'Add' }).click()
      await window.getByRole('menuitem', { name: 'Spreadsheet' }).click()
      const dialog = window.getByRole('dialog', { name: 'New Spreadsheet' })
      await dialog.getByRole('textbox', { name: 'Topic title' }).fill(spreadsheetTitle)
      await dialog.getByRole('button', { name: 'Create' }).click()
      await window.getByRole('link', { name: spreadsheetTitle }).click()
      noteHash = await window.evaluate(() => globalThis.location.hash)

      const grid = window.getByRole('grid')
      await expect(grid).toBeVisible()
      await expect(window.getByRole('button', { name: `Rename Note: ${noteTitle}` })).toHaveCount(0)
      await expect(window.getByText('You are editing')).toHaveCount(0)

      const cells = grid.getByRole('gridcell')
      const formula = window.getByRole('textbox', { name: 'Formula' })
      await cells.nth(0).click()
      await formula.fill('21')
      await formula.press('Enter')
      await expect(cells.nth(0)).toHaveText('21')

      await cells.nth(1).click()
      await formula.fill('=A1*2')
      await formula.press('Enter')
      await expect(cells.nth(1)).toHaveText('42')

      await window.getByRole('button', { name: 'Add sheet' }).click()
      await expect(window.getByRole('tab', { name: 'Sheet 2' })).toHaveAttribute('aria-selected', 'true')
      await expect.poll(async () => {
        const saveError = window.getByText(/^Failed to save Note:/u)
        if (await saveError.count() > 0) {
          const message = await saveError.textContent()
          if (message === null)
            throw new Error('Spreadsheet persistence failed without an error message')
          throw new Error(message)
        }
        return readPersistedSpreadsheet(databasePath, noteTitle)
      }).toEqual(expectedProjection)
      persisted = true
    }
    finally {
      if (persisted) {
        await application.close()
      }
      else {
        const applicationProcess = application.process()
        applicationProcess.kill('SIGKILL')
        if (applicationProcess.exitCode === null)
          await once(applicationProcess, 'exit')
      }
    }

    expect(readPersistedSpreadsheet(databasePath, noteTitle)).toEqual(expectedProjection)
    if (noteHash === null)
      throw new Error('SpreadsheetTopic route was not captured before relaunch')

    const reopenedApplication = await launchApplication(databasePath, directory)
    try {
      const reopenedWindow = await reopenedApplication.firstWindow()
      await reopenedWindow.getByRole('link', { name: 'Journals' }).waitFor()
      await reopenedWindow.evaluate((hash) => {
        globalThis.location.hash = hash
      }, noteHash)

      const reopenedGrid = reopenedWindow.getByRole('grid')
      await expect(reopenedGrid).toBeVisible()
      const reopenedCells = reopenedGrid.getByRole('gridcell')
      await expect(reopenedCells.nth(0)).toHaveText('21')
      await expect(reopenedCells.nth(1)).toHaveText('42')
      await expect(reopenedWindow.getByRole('tab', { name: 'Sheet 1' })).toHaveAttribute('aria-selected', 'true')
      await expect(reopenedWindow.getByRole('tab', { name: 'Sheet 2' })).toBeVisible()
    }
    finally {
      await reopenedApplication.close()
    }
  }
  finally {
    await rm(directory, { force: true, recursive: true })
  }
})
