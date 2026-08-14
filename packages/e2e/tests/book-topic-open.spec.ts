import type { ElectronApplication } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
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

const bookTitle = 'Direct Reader Book'
const noteTitle = 'BookTopic Reading Context'

function onePagePdf(): Buffer {
  const content = 'BT /F1 24 Tf 72 700 Td (Direct reader context) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  const offsets = [0]
  let body = '%PDF-1.4\n'
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, 'ascii'))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body, 'ascii')
  const entries = offsets
    .slice(1)
    .map(offset => `${String(offset).padStart(10, '0')} 00000 n `)
    .join('\n')
  body += `xref\n0 6\n0000000000 65535 f \n${entries}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body, 'ascii')
}

const publicationFeed = `<?xml version="1.0" encoding="UTF-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <title>BookTopic Test Books</title>
    <entry>
      <id>urn:book:direct-reader</id>
      <title>${bookTitle}</title>
      <author><name>Example Author</name></author>
      <link rel="http://opds-spec.org/acquisition" href="/books/direct-reader.pdf" type="application/pdf" />
    </entry>
  </feed>`

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

test('persists and reloads a BookTopic annotation in its bound Reader context', async () => {
  test.setTimeout(120_000)
  const pdf = onePagePdf()
  const server = createServer((request, response) => {
    if (request.url === '/opds') {
      response.writeHead(200, { 'content-type': 'application/atom+xml;profile=opds-catalog' })
      response.end(publicationFeed)
      return
    }
    if (request.url === '/books/direct-reader.pdf') {
      response.writeHead(200, {
        'content-length': pdf.byteLength,
        'content-type': 'application/pdf',
      })
      response.end(pdf)
      return
    }
    response.writeHead(404)
    response.end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string')
    throw new TypeError('Local OPDS server did not expose a TCP port')

  const userDataDirectory = await mkdtemp(resolve(tmpdir(), 'memorilo-book-topic-open-'))
  const databasePath = resolve(userDataDirectory, 'memorilo.sqlite')
  let electronApplication: ElectronApplication | null = null
  try {
    electronApplication = await launchApplication(databasePath, userDataDirectory)
    let window = await electronApplication.firstWindow()
    await window.setViewportSize({ height: 900, width: 1440 })

    await window.getByRole('link', { name: 'Shelf' }).click()
    await window.getByRole('button', { name: 'Add Book Source' }).click()
    await window.getByLabel('OPDS address').fill(`http://127.0.0.1:${address.port}/opds`)
    await window.getByRole('button', { name: 'Add Source' }).click()
    await expect(window.getByRole('heading', { name: bookTitle })).toBeVisible()

    await window.keyboard.press('Meta+P')
    await window.getByRole('combobox', { name: 'Search commands and Notes' }).fill(noteTitle)
    await window.getByRole('option').filter({ hasText: `Create Note \u201C${noteTitle}\u201D` }).click()
    await expect(window.getByRole('button', { name: `Rename Note: ${noteTitle}` })).toBeVisible()

    await window.getByRole('button', { name: 'Show Note Inspector' }).click()
    const structure = window.getByLabel('Structure')
    const regularTopic = structure.getByRole('link', { exact: true, name: noteTitle })
    await expect(regularTopic).toBeVisible()
    await regularTopic.click({ button: 'right' })

    const entryMenu = window.getByRole('menu')
    await expect(entryMenu.getByRole('menuitem', { name: 'Open Book' })).toHaveCount(0)
    await entryMenu.getByRole('menuitem', { exact: true, name: 'Add' }).click()
    await window.getByRole('menuitem', { exact: true, name: 'Book' }).click()

    const picker = window.getByRole('dialog', { name: 'Add Book' })
    await picker.getByRole('option', { name: new RegExp(bookTitle, 'u') }).click()
    await picker.getByRole('button', { exact: true, name: 'Add Book' }).click()

    const bookTopic = structure.getByRole('link', { exact: true, name: bookTitle })
    await expect(bookTopic).toBeVisible()
    await bookTopic.click()

    await expect.poll(() => window.evaluate(() => {
      const [path, searchText = ''] = globalThis.location.hash.slice(1).split('?')
      const search = new URLSearchParams(searchText)
      return {
        noteId: search.get('noteId'),
        path,
        topicId: search.get('topicId'),
      }
    })).toEqual({
      noteId: expect.stringMatching(/\S/u),
      path: expect.stringMatching(/^\/reader\/[a-f0-9]{64}$/u),
      topicId: expect.stringMatching(/\S/u),
    })
    // The first packaged PDF load can initialize PDF.js's worker and range
    // transport lazily; wait for the reader's ready state, not the default
    // five-second assertion window used by ordinary DOM transitions.
    await expect(window.getByLabel('Page 1 of 1')).toBeVisible({ timeout: 30_000 })
    await expect(window.getByRole('heading', { name: `${noteTitle} \u00B7 ${bookTitle}` })).toBeVisible()
    await expect(window.getByRole('heading', { name: 'Choose a reading context' })).toHaveCount(0)
    await expect(window.getByRole('button', { name: 'Select an area to annotate' })).toBeVisible()

    const contextIds = await window.evaluate(() => {
      const [, searchText = ''] = globalThis.location.hash.slice(1).split('?')
      const search = new URLSearchParams(searchText)
      const noteId = search.get('noteId')
      const topicId = search.get('topicId')
      if (!noteId || !topicId)
        throw new Error('Reader route is missing its BookTopic context')
      return { noteId, topicId }
    })
    await window.getByRole('button', { name: 'Select an area to annotate' }).click()
    const page = window.locator('.reader-pdf-page')
    const pageBox = await page.boundingBox()
    if (!pageBox)
      throw new Error('PDF page is not visible')
    await window.mouse.move(pageBox.x + 80, pageBox.y + 90)
    await window.mouse.down()
    await window.mouse.move(pageBox.x + 240, pageBox.y + 160, { steps: 5 })
    await window.mouse.up()
    await window.getByRole('button', { name: 'Highlight area' }).click()

    const highlightedArea = window.getByRole('button', { name: 'Open area annotation' })
    await expect(highlightedArea).toBeVisible()
    await highlightedArea.click()
    const highlightActions = window.getByRole('toolbar', { name: 'Highlight actions' })
    await expect(highlightActions).toBeVisible()
    await highlightActions.getByRole('button', { name: 'Choose annotation color' }).click()
    await highlightActions.getByRole('button', { name: 'blue annotation' }).click()
    await highlightActions.getByRole('button', { name: 'Add annotation' }).click()

    const annotationEditor = window.getByRole('textbox', { name: 'Editor content' }).last()
    await expect(annotationEditor).toBeVisible()
    await annotationEditor.click()
    await window.keyboard.type('Margin annotation')
    await expect(annotationEditor).toContainText('Margin annotation')

    const windowClosed = window.waitForEvent('close')
    await electronApplication.evaluate(({ BrowserWindow }) => {
      const [nativeWindow] = BrowserWindow.getAllWindows()
      if (!nativeWindow)
        throw new Error('Reader persistence test has no native window to close')
      nativeWindow.close()
    })
    await windowClosed
    await electronApplication.close()
    electronApplication = null

    electronApplication = await launchApplication(databasePath, userDataDirectory)
    window = await electronApplication.firstWindow()
    await window.setViewportSize({ height: 900, width: 1440 })
    await window.getByRole('link', { name: 'Journals' }).waitFor()
    await window.evaluate(({ noteId, topicId }) => {
      globalThis.location.hash = `/note/${encodeURIComponent(noteId)}/${encodeURIComponent(topicId)}`
    }, contextIds)
    const structureAfterAnnotation = window.getByLabel('Structure')
    const annotationTopic = structureAfterAnnotation.getByRole('link', {
      exact: true,
      name: 'Area on page 1',
    })
    await expect(annotationTopic).toBeVisible()
    await annotationTopic.click()
    await expect(window.getByRole('link', { name: 'Open source in Reader' })).toBeVisible()
    await expect(window.getByRole('img', { name: 'Area on page 1' })).toBeVisible()
    await expect(window.getByText('Margin annotation')).toBeVisible()

    await window.getByRole('link', { name: 'Open source in Reader' }).click()
    await expect.poll(() => window.evaluate(() => {
      const [, searchText = ''] = globalThis.location.hash.slice(1).split('?')
      const search = new URLSearchParams(searchText)
      return {
        annotationId: search.get('annotationId'),
        noteId: search.get('noteId'),
        topicId: search.get('topicId'),
      }
    })).toEqual({
      annotationId: expect.stringMatching(/\S/u),
      noteId: contextIds.noteId,
      topicId: contextIds.topicId,
    })
    await expect(window.getByRole('toolbar', { name: 'Highlight actions' })).toBeVisible({ timeout: 30_000 })
    await expect(window.getByText('Margin annotation')).toBeVisible()
    const restoredHighlight = window.getByRole('button', { name: 'Open area annotation' })
    await expect(restoredHighlight).toHaveAttribute('data-style', 'highlight')
    const restoredHighlightActions = window.getByRole('toolbar', { name: 'Highlight actions' })
    await expect(restoredHighlightActions.getByRole('button', { name: 'Add annotation' })).toHaveCount(0)
    await restoredHighlightActions.getByRole('button', { name: 'Choose annotation color' }).click()
    const restoredBlue = restoredHighlightActions.getByRole('button', { name: 'blue annotation' })
    await expect(restoredBlue).toHaveAttribute('aria-pressed', 'true')
    await restoredBlue.click()

    await restoredHighlightActions
      .getByRole('button', { name: 'Delete highlight' })
      .click()
    await expect(window.getByRole('button', { name: 'Delete highlight and Topic' })).toHaveCount(0)
    const deleteHighlight = window.getByRole('dialog').getByRole('button', { name: 'Delete highlight' })
    await expect(deleteHighlight).toBeFocused()
    await deleteHighlight.click()
    await expect(window.getByRole('button', { name: 'Open area annotation' })).toHaveCount(0)

    await window.evaluate(({ noteId, topicId }) => {
      globalThis.location.hash = `/note/${encodeURIComponent(noteId)}/${encodeURIComponent(topicId)}`
    }, contextIds)
    const retainedAnnotationTopic = window.getByLabel('Structure').getByRole('link', {
      exact: true,
      name: 'Area on page 1',
    })
    await expect(retainedAnnotationTopic).toBeVisible()
    await retainedAnnotationTopic.click()
    await expect(window.getByRole('link', { name: 'Open source in Reader' })).toHaveCount(0)
    await expect(window.getByRole('img', { name: 'Area on page 1' })).toBeVisible()
    await expect(window.getByText('Margin annotation')).toBeVisible()
  }
  finally {
    await electronApplication?.close()
    await rm(userDataDirectory, { force: true, recursive: true })
    server.close()
  }
})
