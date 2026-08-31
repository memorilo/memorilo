import type { OperationSupervisor } from '@memorilo/effect-lifecycle'
import type { CachedShelfAsset, ShelfImageCache } from '@memorilo/shelf'
import type { EditorStorageDatabase, EditorStorageDrizzleDatabase } from './database-driver'
import { createOperationSupervisor } from '@memorilo/effect-lifecycle'
import { and, desc, eq, notExists, sql } from 'drizzle-orm'
import { shelfAssets, shelfImageCacheEntries } from './drizzle-schema'
import { assertNonEmpty } from './editor-storage-shared'
import { normalizeShelfRemoteUrl } from './shelf-storage-shared'

const defaultMaximumImageCacheBytes = 256 * 1024 * 1024

export interface SqliteShelfImageCacheOptions {
  database: EditorStorageDatabase
  maximumBytes?: number
}

interface ShelfImageRow {
  bytes: Uint8Array
  etag: string | null
  fetched_at: number
  last_modified: string | null
  mime_type: string
  source_id: string
  url: string
}

export class SqliteShelfImageCache implements ShelfImageCache {
  readonly #database: EditorStorageDatabase
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #maximumBytes: number
  readonly #operations: OperationSupervisor

  private constructor(database: EditorStorageDatabase, maximumBytes: number) {
    this.#database = database
    this.#orm = database.drizzle
    this.#maximumBytes = maximumBytes
    this.#operations = createOperationSupervisor('Shelf image cache')
  }

  static async open(options: SqliteShelfImageCacheOptions): Promise<SqliteShelfImageCache> {
    const maximumBytes = options.maximumBytes ?? defaultMaximumImageCacheBytes
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
      throw new RangeError('Shelf image cache maximum size must be a positive safe integer')
    await options.database.migrate()
    const orm = options.database.drizzle
    const entries = orm.select({ sourceId: shelfImageCacheEntries.sourceId, url: shelfImageCacheEntries.url, byteSize: shelfImageCacheEntries.byteSize })
      .from(shelfImageCacheEntries)
      .orderBy(desc(shelfImageCacheEntries.lastAccessedAt), desc(shelfImageCacheEntries.sourceId), desc(shelfImageCacheEntries.url))
      .all()
    let retained = 0
    for (const entry of entries) {
      retained += entry.byteSize
      if (retained > maximumBytes)
        orm.delete(shelfAssets).where(and(eq(shelfAssets.sourceId, entry.sourceId), eq(shelfAssets.url, entry.url))).run()
    }
    orm.delete(shelfImageCacheEntries).where(notExists(
      orm.select({ sourceId: shelfAssets.sourceId })
        .from(shelfAssets)
        .where(and(
          eq(shelfAssets.sourceId, shelfImageCacheEntries.sourceId),
          eq(shelfAssets.url, shelfImageCacheEntries.url),
        )),
    )).run()
    return new SqliteShelfImageCache(options.database, maximumBytes)
  }

  #run<Result>(operation: () => Promise<Result>): Promise<Result> {
    return this.#operations.run(operation)
  }

  close(): Promise<void> {
    return this.#operations.close()
  }

  async deleteSource(sourceId: string): Promise<void> {
    assertNonEmpty(sourceId, 'Shelf image source id')
    return this.#run(async () => {
      this.#orm.delete(shelfImageCacheEntries).where(eq(shelfImageCacheEntries.sourceId, sourceId)).run()
      this.#orm.delete(shelfAssets).where(eq(shelfAssets.sourceId, sourceId)).run()
    })
  }

  async get(sourceId: string, url: string): Promise<CachedShelfAsset | null> {
    assertNonEmpty(sourceId, 'Shelf image source id')
    const normalizedUrl = normalizeShelfRemoteUrl(url, 'Shelf image URL')
    return this.#run(async () => {
      await this.#database.beforeDrizzleRead?.('SELECT source_id, url, bytes, mime_type, etag, last_modified, fetched_at FROM shelf_assets')
      const row = this.#orm.select({
        source_id: shelfAssets.sourceId,
        url: shelfAssets.url,
        bytes: shelfAssets.bytes,
        mime_type: shelfAssets.mimeType,
        etag: shelfAssets.etag,
        last_modified: shelfAssets.lastModified,
        fetched_at: shelfAssets.fetchedAt,
      }).from(shelfAssets).where(and(eq(shelfAssets.sourceId, sourceId), eq(shelfAssets.url, normalizedUrl))).get() as ShelfImageRow | undefined
      if (!row)
        return null

      const accessedAt = Date.now()
      const maxAccessed = this.#orm.select({ value: sql<number>`coalesce(max(${shelfImageCacheEntries.lastAccessedAt}) + 1, ${accessedAt})` }).from(shelfImageCacheEntries).get()?.value ?? accessedAt
      this.#orm.insert(shelfImageCacheEntries).values({ sourceId, url: normalizedUrl, byteSize: row.bytes.byteLength, lastAccessedAt: Math.max(accessedAt, maxAccessed) }).onConflictDoUpdate({ target: [shelfImageCacheEntries.sourceId, shelfImageCacheEntries.url], set: { byteSize: row.bytes.byteLength, lastAccessedAt: Math.max(accessedAt, maxAccessed) } }).run()

      return {
        bytes: new Uint8Array(row.bytes),
        etag: row.etag,
        fetchedAt: row.fetched_at,
        lastModified: row.last_modified,
        mimeType: row.mime_type,
        sourceId: row.source_id,
        url: row.url,
      }
    })
  }

  async save(asset: CachedShelfAsset): Promise<void> {
    const saved = structuredClone(asset)
    assertNonEmpty(saved.sourceId, 'Shelf image source id')
    const normalizedUrl = normalizeShelfRemoteUrl(saved.url, 'Shelf image URL')
    if (saved.bytes.byteLength === 0)
      throw new TypeError('Shelf image must contain bytes')
    if (!saved.mimeType.startsWith('image/'))
      throw new TypeError('Shelf image MIME type must be an image')
    if (!Number.isSafeInteger(saved.fetchedAt) || saved.fetchedAt < 0)
      throw new RangeError('Shelf image fetch time must be a non-negative safe integer')
    const accessedAt = Date.now()
    return this.#run(async () => {
      this.#orm.transaction((tx) => {
        tx.insert(shelfAssets).values({ sourceId: saved.sourceId, url: normalizedUrl, bytes: saved.bytes, mimeType: saved.mimeType, etag: saved.etag, lastModified: saved.lastModified, fetchedAt: saved.fetchedAt }).onConflictDoUpdate({ target: [shelfAssets.sourceId, shelfAssets.url], set: { bytes: saved.bytes, mimeType: saved.mimeType, etag: saved.etag, lastModified: saved.lastModified, fetchedAt: saved.fetchedAt } }).run()
        tx.insert(shelfImageCacheEntries).values({ sourceId: saved.sourceId, url: normalizedUrl, byteSize: saved.bytes.byteLength, lastAccessedAt: accessedAt }).onConflictDoUpdate({ target: [shelfImageCacheEntries.sourceId, shelfImageCacheEntries.url], set: { byteSize: saved.bytes.byteLength, lastAccessedAt: accessedAt } }).run()
      })
      const entries = this.#orm.select({ sourceId: shelfImageCacheEntries.sourceId, url: shelfImageCacheEntries.url, byteSize: shelfImageCacheEntries.byteSize })
        .from(shelfImageCacheEntries)
        .orderBy(desc(shelfImageCacheEntries.lastAccessedAt), desc(shelfImageCacheEntries.sourceId), desc(shelfImageCacheEntries.url))
        .all()
      let retained = 0
      for (const entry of entries) {
        retained += entry.byteSize
        if (retained > this.#maximumBytes)
          this.#orm.delete(shelfAssets).where(and(eq(shelfAssets.sourceId, entry.sourceId), eq(shelfAssets.url, entry.url))).run()
      }
      this.#orm.delete(shelfImageCacheEntries).where(notExists(
        this.#orm.select({ sourceId: shelfAssets.sourceId })
          .from(shelfAssets)
          .where(and(
            eq(shelfAssets.sourceId, shelfImageCacheEntries.sourceId),
            eq(shelfAssets.url, shelfImageCacheEntries.url),
          )),
      )).run()
    })
  }
}
