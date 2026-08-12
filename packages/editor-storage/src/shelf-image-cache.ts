import type { OperationSupervisor } from '@memorilo/effect-lifecycle'
import type { CachedShelfAsset, ShelfImageCache } from '@memorilo/shelf'
import type { EditorStorageDatabase } from './database-driver'
import { createOperationSupervisor } from '@memorilo/effect-lifecycle'
import { assertNonEmpty } from './editor-storage-shared'
import { normalizeShelfRemoteUrl } from './shelf-storage-shared'

const defaultMaximumImageCacheBytes = 256 * 1024 * 1024

export interface SqliteShelfImageCacheOptions {
  database: EditorStorageDatabase
  maximumBytes?: number
}

export interface CreateShelfImageCacheOptions extends SqliteShelfImageCacheOptions {}

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

export class SqliteShelfImageCache implements ShelfImageCache {
  readonly #database: EditorStorageDatabase
  readonly #maximumBytes: number
  readonly #operations: OperationSupervisor

  private constructor(database: EditorStorageDatabase, maximumBytes: number) {
    this.#database = database
    this.#maximumBytes = maximumBytes
    this.#operations = createOperationSupervisor('Shelf image cache')
  }

  static async open(options: SqliteShelfImageCacheOptions): Promise<SqliteShelfImageCache> {
    const maximumBytes = options.maximumBytes ?? defaultMaximumImageCacheBytes
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
      throw new RangeError('Shelf image cache maximum size must be a positive safe integer')
    await options.database.exec(imageCacheSchema)
    await options.database.batch([
      {
        sql: `
          DELETE FROM shelf_assets
          WHERE length(bytes) <= 0
            OR mime_type NOT LIKE 'image/%'
            OR fetched_at < 0
        `,
      },
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
      ...pruningCommands(maximumBytes),
    ])
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
    return this.#run(() => this.#database.batch([
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
    const normalizedUrl = normalizeShelfRemoteUrl(url, 'Shelf image URL')
    return this.#run(async () => {
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
    return this.#run(() => this.#database.batch([
      {
        parameters: [
          saved.sourceId,
          normalizedUrl,
          saved.bytes,
          saved.mimeType,
          saved.etag,
          saved.lastModified,
          saved.fetchedAt,
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
        parameters: [saved.sourceId, normalizedUrl, saved.bytes.byteLength, accessedAt, accessedAt],
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

/** @deprecated Prefer `SqliteShelfImageCache.open`. */
export function createShelfImageCache(options: CreateShelfImageCacheOptions): Promise<SqliteShelfImageCache> {
  return SqliteShelfImageCache.open(options)
}
