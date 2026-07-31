import type { CachedShelfAsset, ShelfImageCache } from '@memorilo/shelf'
import type { EditorStorageDatabase } from './database-driver'

const defaultMaximumImageCacheBytes = 256 * 1024 * 1024

export interface CreateShelfImageCacheOptions {
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

const imageCacheSchema = `
  CREATE TABLE IF NOT EXISTS shelf_assets (
    source_id TEXT NOT NULL,
    url TEXT NOT NULL,
    bytes BLOB NOT NULL,
    mime_type TEXT NOT NULL,
    etag TEXT,
    last_modified TEXT,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (source_id, url)
  );

  CREATE TABLE IF NOT EXISTS shelf_image_cache_entries (
    source_id TEXT NOT NULL,
    url TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    last_accessed_at INTEGER NOT NULL CHECK (last_accessed_at >= 0),
    PRIMARY KEY (source_id, url),
    FOREIGN KEY (source_id, url) REFERENCES shelf_assets(source_id, url) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS shelf_image_cache_lru_idx
    ON shelf_image_cache_entries(last_accessed_at, source_id, url);
`

function pruningCommands(maximumBytes: number) {
  return [
    {
      parameters: [maximumBytes],
      sql: `
        DELETE FROM shelf_assets
        WHERE EXISTS (
          SELECT 1
          FROM (
            SELECT
              source_id,
              url,
              SUM(byte_size) OVER (
                ORDER BY last_accessed_at DESC, source_id DESC, url DESC
              ) AS retained_bytes
            FROM shelf_image_cache_entries
          ) AS retained
          WHERE retained.source_id = shelf_assets.source_id
            AND retained.url = shelf_assets.url
            AND retained.retained_bytes > ?
        )
      `,
    },
    {
      sql: `
        DELETE FROM shelf_image_cache_entries
        WHERE NOT EXISTS (
          SELECT 1
          FROM shelf_assets
          WHERE shelf_assets.source_id = shelf_image_cache_entries.source_id
            AND shelf_assets.url = shelf_image_cache_entries.url
        )
      `,
    },
  ] as const
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
}

function validateRemoteUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new TypeError('Shelf image URL must use HTTP or HTTPS')
  return url.href
}

class DefaultShelfImageCache implements ShelfImageCache {
  readonly #database: EditorStorageDatabase
  readonly #maximumBytes: number
  #writeQueue: Promise<void> = Promise.resolve()

  private constructor(database: EditorStorageDatabase, maximumBytes: number) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
      throw new RangeError('Shelf image cache maximum size must be a positive safe integer')
    this.#database = database
    this.#maximumBytes = maximumBytes
  }

  static async create(options: CreateShelfImageCacheOptions): Promise<DefaultShelfImageCache> {
    const cache = new DefaultShelfImageCache(
      options.database,
      options.maximumBytes ?? defaultMaximumImageCacheBytes,
    )
    await options.database.exec(imageCacheSchema)
    await options.database.batch([
      {
        sql: `
          INSERT INTO shelf_image_cache_entries (source_id, url, byte_size, last_accessed_at)
          SELECT source_id, url, length(bytes), fetched_at
          FROM shelf_assets
          WHERE true
          ON CONFLICT(source_id, url) DO UPDATE SET
            byte_size = excluded.byte_size
        `,
      },
      ...pruningCommands(cache.#maximumBytes),
    ])
    return cache
  }

  async #serializeWrite<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#writeQueue.then(operation)
    this.#writeQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async deleteSource(sourceId: string): Promise<void> {
    assertNonEmpty(sourceId, 'Shelf image source id')
    await this.#serializeWrite(() => this.#database.batch([
      {
        parameters: [sourceId],
        sql: 'DELETE FROM shelf_image_cache_entries WHERE source_id = ?',
      },
      {
        parameters: [sourceId],
        sql: 'DELETE FROM shelf_assets WHERE source_id = ?',
      },
    ]))
  }

  async get(sourceId: string, url: string): Promise<CachedShelfAsset | null> {
    assertNonEmpty(sourceId, 'Shelf image source id')
    const normalizedUrl = validateRemoteUrl(url)
    return this.#serializeWrite(async () => {
      const row = await this.#database.get<ShelfImageRow>(`
        SELECT source_id, url, bytes, mime_type, etag, last_modified, fetched_at
        FROM shelf_assets
        WHERE source_id = ? AND url = ?
      `, [sourceId, normalizedUrl])
      if (!row)
        return null

      const accessedAt = Date.now()
      await this.#database.run(`
        INSERT INTO shelf_image_cache_entries (source_id, url, byte_size, last_accessed_at)
        VALUES (
          ?,
          ?,
          ?,
          MAX(?, COALESCE((SELECT MAX(last_accessed_at) + 1 FROM shelf_image_cache_entries), ?))
        )
        ON CONFLICT(source_id, url) DO UPDATE SET
          byte_size = excluded.byte_size,
          last_accessed_at = excluded.last_accessed_at
      `, [sourceId, normalizedUrl, row.bytes.byteLength, accessedAt, accessedAt])

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
    assertNonEmpty(asset.sourceId, 'Shelf image source id')
    const normalizedUrl = validateRemoteUrl(asset.url)
    if (asset.bytes.byteLength === 0)
      throw new TypeError('Shelf image must contain bytes')
    if (!asset.mimeType.startsWith('image/'))
      throw new TypeError('Shelf image MIME type must be an image')
    const accessedAt = Date.now()
    await this.#serializeWrite(() => this.#database.batch([
      {
        parameters: [
          asset.sourceId,
          normalizedUrl,
          asset.bytes,
          asset.mimeType,
          asset.etag,
          asset.lastModified,
          asset.fetchedAt,
        ],
        sql: `
          INSERT INTO shelf_assets (source_id, url, bytes, mime_type, etag, last_modified, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id, url) DO UPDATE SET
            bytes = excluded.bytes,
            mime_type = excluded.mime_type,
            etag = excluded.etag,
            last_modified = excluded.last_modified,
            fetched_at = excluded.fetched_at
        `,
      },
      {
        parameters: [asset.sourceId, normalizedUrl, asset.bytes.byteLength, accessedAt, accessedAt],
        sql: `
          INSERT INTO shelf_image_cache_entries (source_id, url, byte_size, last_accessed_at)
          VALUES (
            ?,
            ?,
            ?,
            MAX(?, COALESCE((SELECT MAX(last_accessed_at) + 1 FROM shelf_image_cache_entries), ?))
          )
          ON CONFLICT(source_id, url) DO UPDATE SET
            byte_size = excluded.byte_size,
            last_accessed_at = excluded.last_accessed_at
        `,
      },
      ...pruningCommands(this.#maximumBytes),
    ]))
  }
}

export async function createShelfImageCache(options: CreateShelfImageCacheOptions): Promise<ShelfImageCache> {
  return DefaultShelfImageCache.create(options)
}
