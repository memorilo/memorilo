import type { ElectronApplication } from '@playwright/test'
import type Database from 'better-sqlite3'
import { Buffer } from 'node:buffer'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { _electron as electron, expect, test } from '@playwright/test'
import BetterSqlite3 from 'better-sqlite3'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktopDirectory = resolve(repositoryRoot, 'apps/desktop')
const electronModule: unknown = createRequire(import.meta.url)('electron')
if (typeof electronModule !== 'string')
  throw new TypeError('Electron package did not resolve to an executable path')
const electronExecutablePath = electronModule

const imageContents = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

interface StoredAssetRow {
  byte_size: number
  deletion_claimed_at: number | null
  file_name: string
  mime_type: string
  original_file_name: string
  reference_count: number
  unreferenced_at: number | null
}

function readStoredAssets(databasePath: string): readonly StoredAssetRow[] {
  const database: Database.Database = new BetterSqlite3(databasePath, { readonly: true })
  try {
    return database.prepare(`
      SELECT
        assets.file_name,
        assets.original_file_name,
        assets.mime_type,
        assets.byte_size,
        assets.unreferenced_at,
        assets.deletion_claimed_at,
        COALESCE(SUM(note_asset_references.reference_count), 0) AS reference_count
      FROM assets
      LEFT JOIN note_asset_references
        ON note_asset_references.asset_file_name = assets.file_name
      GROUP BY assets.file_name
    `).all() as StoredAssetRow[]
  }
  finally {
    database.close()
  }
}

function launchApplication(databasePath: string, userDataDirectory: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [desktopDirectory, `--user-data-dir=${userDataDirectory}`],
    cwd: repositoryRoot,
    env: {
      ...process.env,
      MEMORILO_DATABASE_PATH: databasePath,
      MEMORILO_EMBEDDING_MODEL_OFFLINE: '1',
      MEMORILO_E2E_HIDE_WINDOW: '1',
    },
    executablePath: electronExecutablePath,
  })
}

test('persists an uploaded image beside the database and renders it after restart', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'memorilo-image-asset-'))
  const databasePath = resolve(directory, 'memorilo.sqlite')
  const userDataDirectory = resolve(directory, 'user-data')
  const assetDirectory = resolve(directory, 'assets')
  const title = 'Persistent image asset 7f2c91'
  let application: ElectronApplication | null = null

  try {
    application = await launchApplication(databasePath, userDataDirectory)
    let window = await application.firstWindow()

    await window.getByRole('link', { name: 'Journals' }).waitFor()
    await window.keyboard.press('Meta+P')
    await window.getByRole('combobox', { name: 'Search commands and Notes' }).fill(title)
    await window.getByRole('option').filter({ hasText: `Create Note “${title}”` }).click()

    const editor = window.getByRole('textbox', { name: 'Editor content' })
    await expect(editor.locator('h1').first()).toHaveText(title)
    await editor.click({ button: 'right' })
    await window.getByRole('menuitem', { name: 'Insert image…' }).click()

    const imageDialog = window.getByRole('dialog', { name: 'Insert image' })
    await imageDialog.getByLabel('Upload').setInputFiles({
      buffer: imageContents,
      mimeType: 'image/png',
      name: 'sample-image.png',
    })
    await imageDialog.getByRole('button', { name: 'Upload Image' }).click()

    const image = editor.getByRole('img', { name: 'upload preview' })
    await expect(image).toHaveAttribute('src', /^memorilo-asset:\/\/\/[0-9a-f-]+\.png$/)
    const assetUrl = await image.getAttribute('src')
    if (!assetUrl)
      throw new Error('Uploaded image did not receive an asset URL')
    const imageRequest = await application.evaluate(async ({ net }, src) => {
      const response = await net.fetch(src)
      return {
        body: Array.from(new Uint8Array(await response.arrayBuffer())),
        contentType: response.headers.get('content-type'),
        status: response.status,
      }
    }, assetUrl)
    expect(imageRequest).toEqual({
      body: Array.from(imageContents),
      contentType: 'image/png',
      status: 200,
    })
    await expect.poll(() => image.evaluate(element => ({
      complete: (element as HTMLImageElement).complete,
      naturalHeight: (element as HTMLImageElement).naturalHeight,
      naturalWidth: (element as HTMLImageElement).naturalWidth,
    }))).toEqual({ complete: true, naturalHeight: 1, naturalWidth: 1 })

    const assetFileName = new URL(assetUrl).pathname.slice(1)
    const noteHash = await window.evaluate(() => globalThis.location.hash)

    await expect.poll(async () => readStoredAssets(databasePath)).toEqual([{
      byte_size: imageContents.byteLength,
      deletion_claimed_at: null,
      file_name: assetFileName,
      mime_type: 'image/png',
      original_file_name: 'sample-image.png',
      reference_count: 1,
      unreferenced_at: null,
    }])
    await expect.poll(() => readdir(assetDirectory)).toEqual([assetFileName])
    await expect.poll(() => readFile(resolve(assetDirectory, assetFileName))).toEqual(imageContents)

    await application.close()
    application = null

    application = await launchApplication(databasePath, userDataDirectory)
    window = await application.firstWindow()
    await window.getByRole('link', { name: 'Journals' }).waitFor()
    await window.evaluate((hash) => {
      globalThis.location.hash = hash
    }, noteHash)

    const reopenedEditor = window.getByRole('textbox', { name: 'Editor content' })
    const reopenedImage = reopenedEditor.getByRole('img', { name: 'upload preview' })
    await expect(reopenedImage).toHaveAttribute('src', assetUrl)
    await expect.poll(() => reopenedImage.evaluate(element => ({
      complete: (element as HTMLImageElement).complete,
      naturalHeight: (element as HTMLImageElement).naturalHeight,
      naturalWidth: (element as HTMLImageElement).naturalWidth,
    }))).toEqual({ complete: true, naturalHeight: 1, naturalWidth: 1 })
    expect(readStoredAssets(databasePath)).toEqual([{
      byte_size: imageContents.byteLength,
      deletion_claimed_at: null,
      file_name: assetFileName,
      mime_type: 'image/png',
      original_file_name: 'sample-image.png',
      reference_count: 1,
      unreferenced_at: null,
    }])
  }
  finally {
    await application?.close()
    await rm(directory, { force: true, recursive: true })
  }
})
