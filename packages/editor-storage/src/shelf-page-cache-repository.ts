import type { CachedShelfPage, ShelfPage, ShelfPublication } from '@memorilo/shelf'
import type { DatabaseCommand, EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from './database-driver'
import { and, desc, eq } from 'drizzle-orm'
import { shelfPages } from './drizzle-schema'
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
    drizzle: database => database.insert(shelfPages).values({
      etag: page.etag,
      fetchedAt: page.fetchedAt,
      lastModified: page.lastModified,
      pageJson: JSON.stringify(page.page),
      sourceId: page.sourceId,
      url: normalizedUrl,
    }).onConflictDoUpdate({
      set: {
        etag: page.etag,
        fetchedAt: page.fetchedAt,
        lastModified: page.lastModified,
        pageJson: JSON.stringify(page.page),
      },
      target: [shelfPages.sourceId, shelfPages.url],
    }).run(),
  }
}

export class ShelfPageCacheRepository {
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #runOperation: ShelfPageCacheRepositoryDependencies['runOperation']

  constructor(dependencies: ShelfPageCacheRepositoryDependencies) {
    this.#orm = dependencies.database.drizzle
    this.#runOperation = dependencies.runOperation
  }

  async get(sourceId: string, url: string): Promise<CachedShelfPage | null> {
    assertNonEmpty(sourceId, 'Shelf source id')
    const normalizedUrl = normalizeShelfRemoteUrl(url, 'Shelf source URL')
    return this.#runOperation(async () => {
      const row = this.#orm.select({
        source_id: shelfPages.sourceId,
        url: shelfPages.url,
        page_json: shelfPages.pageJson,
        etag: shelfPages.etag,
        last_modified: shelfPages.lastModified,
        fetched_at: shelfPages.fetchedAt,
      }).from(shelfPages).where(and(eq(shelfPages.sourceId, sourceId), eq(shelfPages.url, normalizedUrl))).get() as ShelfPageRow | undefined
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
      const rows = this.#orm.select({ page_json: shelfPages.pageJson })
        .from(shelfPages)
        .where(eq(shelfPages.sourceId, sourceId))
        .orderBy(desc(shelfPages.fetchedAt))
        .all() as Pick<ShelfPageRow, 'page_json'>[]
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
    assertNonEmpty(saved.sourceId, 'Shelf page source id')
    const normalizedUrl = normalizeShelfRemoteUrl(saved.url, 'Shelf page URL')
    return this.#runOperation(async () => {
      this.#orm.insert(shelfPages).values({
        sourceId: saved.sourceId,
        url: normalizedUrl,
        pageJson: JSON.stringify(saved.page),
        etag: saved.etag,
        lastModified: saved.lastModified,
        fetchedAt: saved.fetchedAt,
      }).onConflictDoUpdate({
        target: [shelfPages.sourceId, shelfPages.url],
        set: { pageJson: JSON.stringify(saved.page), etag: saved.etag, lastModified: saved.lastModified, fetchedAt: saved.fetchedAt },
      }).run()
    })
  }
}
