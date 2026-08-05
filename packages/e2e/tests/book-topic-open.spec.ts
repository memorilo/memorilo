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

test('opens a BookTopic from Structure in its bound reader context', async () => {
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
  try {
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
      await expect(window.getByLabel('Page 1 of 1')).toBeVisible()
      await expect(window.getByRole('heading', { name: `${noteTitle} \u00B7 ${bookTitle}` })).toBeVisible()
      await expect(window.getByRole('heading', { name: 'Choose a reading context' })).toHaveCount(0)
      await expect(window.getByRole('button', { name: 'Select an area to annotate' })).toBeVisible()
    }
    finally {
      await electronApplication.close()
    }
  }
  finally {
    await rm(userDataDirectory, { force: true, recursive: true })
    server.close()
  }
})
