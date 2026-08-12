import type { CachedShelfPage, ShelfPage, ShelfPublication } from '@memorilo/shelf'
import type { DatabaseCommand, EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import { assertNonEmpty } from './editor-storage-shared'
import { normalizeShelfRemoteUrl } from './shelf-storage-shared'

interface ShelfPageCacheRepositoryDependencies {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

interface ShelfPageRow {
  etag: string | null
  fetched_at: number
  last_modified: string | null
  page_json: string
  source_id: string
  url: string
}

function parsePage(value: string): ShelfPage {
  const page: unknown = JSON.parse(value)
  if (page === null || Array.isArray(page) || typeof page !== 'object')
    throw new TypeError('Stored Shelf page must be an object')
  const record = page as Record<string, unknown>
  if (typeof record.title !== 'string' || typeof record.selfUrl !== 'string')
    throw new TypeError('Stored Shelf page is missing its title or URL')
  if (!Array.isArray(record.navigation) || !Array.isArray(record.publications))
    throw new TypeError('Stored Shelf page has invalid content collections')
  return page as ShelfPage
}

export function saveShelfPageCommand(page: CachedShelfPage): DatabaseCommand {
  assertNonEmpty(page.sourceId, 'Shelf page source id')
  const normalizedUrl = normalizeShelfRemoteUrl(page.url, 'Shelf page URL')
  return {
    parameters: [page.sourceId, normalizedUrl, JSON.stringify(page.page), page.etag, page.lastModified, page.fetchedAt],
    sql: `
      INSERT INTO shelf_pages (source_id, url, page_json, etag, last_modified, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, url) DO UPDATE SET
        page_json = excluded.page_json,
        etag = excluded.etag,
        last_modified = excluded.last_modified,
        fetched_at = excluded.fetched_at
    `,
  }
}

export class ShelfPageCacheRepository {
  readonly #database: EditorStorageDatabase
  readonly #runOperation: ShelfPageCacheRepositoryDependencies['runOperation']

  constructor(dependencies: ShelfPageCacheRepositoryDependencies) {
    this.#database = dependencies.database
    this.#runOperation = dependencies.runOperation
  }

  async get(sourceId: string, url: string): Promise<CachedShelfPage | null> {
    assertNonEmpty(sourceId, 'Shelf source id')
    const normalizedUrl = normalizeShelfRemoteUrl(url, 'Shelf source URL')
    return this.#runOperation(async () => {
      const row = await this.#database.get<ShelfPageRow>(`
        SELECT source_id, url, page_json, etag, last_modified, fetched_at
        FROM shelf_pages
        WHERE source_id = ? AND url = ?
      `, [sourceId, normalizedUrl])
      return row
        ? {
            etag: row.etag,
            fetchedAt: row.fetched_at,
            lastModified: row.last_modified,
            page: parsePage(row.page_json),
            sourceId: row.source_id,
            url: row.url,
          }
        : null
    })
  }

  async getPublication(sourceId: string, publicationId: string): Promise<ShelfPublication | null> {
    assertNonEmpty(sourceId, 'Shelf source id')
    assertNonEmpty(publicationId, 'Shelf publication id')
    return this.#runOperation(async () => {
      const rows = await this.#database.all<Pick<ShelfPageRow, 'page_json'>>(`
        SELECT page_json
        FROM shelf_pages
        WHERE source_id = ?
        ORDER BY fetched_at DESC
      `, [sourceId])
      for (const row of rows) {
        const publication = parsePage(row.page_json).publications.find(candidate => candidate.id === publicationId)
        if (publication)
          return publication
      }
      return null
    })
  }

  async save(page: CachedShelfPage): Promise<void> {
    const saved = structuredClone(page)
    return this.#runOperation(() => this.#database.batch([saveShelfPageCommand(saved)]))
  }
}
