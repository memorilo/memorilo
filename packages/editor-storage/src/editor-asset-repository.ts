import type { EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import type { AssetStatistics, RegisterAssetInput, StoredAsset } from './editor-storage-contracts'
import type { AssetRow, AssetStatisticsRow } from './editor-storage-rows'
import { assertNonEmpty } from './editor-storage-shared'

interface EditorAssetRepositoryDependencies {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

export function validateAssetFileName(fileName: string): void {
  assertNonEmpty(fileName, 'Asset file name')
  if (!/^[0-9a-f-]+\.[a-z0-9]+$/.test(fileName))
    throw new TypeError('Asset file name has an invalid format')
}

function toStoredAsset(row: AssetRow): StoredAsset {
  return {
    byteSize: row.byte_size,
    createdAt: row.created_at,
    fileName: row.file_name,
    mimeType: row.mime_type,
    originalFileName: row.original_file_name,
  }
}

export class EditorAssetRepository {
  readonly #database: EditorStorageDatabase
  readonly #runOperation: EditorAssetRepositoryDependencies['runOperation']

  constructor(dependencies: EditorAssetRepositoryDependencies) {
    this.#database = dependencies.database
    this.#runOperation = dependencies.runOperation
  }

  claimUnreferenced(input: { fileName: string, unreferencedBefore: number }): Promise<StoredAsset | null> {
    validateAssetFileName(input.fileName)
    if (!Number.isFinite(input.unreferencedBefore))
      return Promise.reject(new TypeError('Asset reference cutoff must be finite'))
    return this.#runOperation(async () => {
      const row = await this.#database.get<AssetRow>(`
        UPDATE assets
        SET deletion_claimed_at = ?
        WHERE file_name = ?
          AND unreferenced_at <= ?
          AND deletion_claimed_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM note_asset_references WHERE asset_file_name = assets.file_name
          )
        RETURNING file_name, original_file_name, mime_type, byte_size, created_at
      `, [Date.now(), input.fileName, input.unreferencedBefore])
      return row ? toStoredAsset(row) : null
    })
  }

  completeDeletion(input: { fileName: string }): Promise<void> {
    validateAssetFileName(input.fileName)
    return this.#runOperation(async () => {
      await this.#database.run(`
        DELETE FROM assets
        WHERE file_name = ?
          AND deletion_claimed_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM note_asset_references WHERE asset_file_name = assets.file_name
          )
      `, [input.fileName])
    })
  }

  getStatistics(): Promise<AssetStatistics> {
    return this.#runOperation(async () => {
      const row = await this.#database.get<AssetStatisticsRow>(`
        SELECT
          (SELECT COUNT(*) FROM assets) AS managed_asset_count,
          (SELECT COALESCE(SUM(reference_count), 0) FROM note_asset_references) AS reference_count
      `)
      if (!row)
        throw new Error('Failed to read Asset statistics')
      return {
        managedAssetCount: row.managed_asset_count,
        referenceCount: row.reference_count,
      }
    })
  }

  list(): Promise<readonly StoredAsset[]> {
    return this.#runOperation(async () => {
      const rows = await this.#database.all<AssetRow>(`
        SELECT file_name, original_file_name, mime_type, byte_size, created_at
        FROM assets
        ORDER BY created_at ASC, file_name ASC
      `)
      return rows.map(toStoredAsset)
    })
  }

  listClaimed(): Promise<readonly StoredAsset[]> {
    return this.#runOperation(async () => {
      const rows = await this.#database.all<AssetRow>(`
        SELECT file_name, original_file_name, mime_type, byte_size, created_at
        FROM assets
        WHERE deletion_claimed_at IS NOT NULL
        ORDER BY created_at ASC, file_name ASC
      `)
      return rows.map(toStoredAsset)
    })
  }

  listUnreferenced(input: { unreferencedBefore: number }): Promise<readonly StoredAsset[]> {
    if (!Number.isFinite(input.unreferencedBefore))
      return Promise.reject(new TypeError('Asset reference cutoff must be finite'))
    return this.#runOperation(async () => {
      const rows = await this.#database.all<AssetRow>(`
        SELECT file_name, original_file_name, mime_type, byte_size, created_at
        FROM assets
        WHERE unreferenced_at <= ?
          AND deletion_claimed_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM note_asset_references WHERE asset_file_name = assets.file_name
          )
        ORDER BY created_at ASC, file_name ASC
      `, [input.unreferencedBefore])
      return rows.map(toStoredAsset)
    })
  }

  register(input: RegisterAssetInput): Promise<StoredAsset> {
    validateAssetFileName(input.fileName)
    assertNonEmpty(input.originalFileName, 'Original asset file name')
    assertNonEmpty(input.mimeType, 'Asset MIME type')
    if (!Number.isInteger(input.byteSize) || input.byteSize <= 0)
      return Promise.reject(new RangeError('Asset byte size must be a positive integer'))
    if (input.createdAt !== undefined && !Number.isFinite(input.createdAt))
      return Promise.reject(new TypeError('Asset creation time must be finite'))
    const saved = structuredClone(input)
    return this.#runOperation(async () => {
      const createdAt = saved.createdAt ?? Date.now()
      await this.#database.run(`
        INSERT INTO assets (
          file_name, original_file_name, mime_type, byte_size, created_at, unreferenced_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_name) DO NOTHING
      `, [saved.fileName, saved.originalFileName, saved.mimeType, saved.byteSize, createdAt, createdAt])
      const row = await this.#database.get<AssetRow>(`
        SELECT file_name, original_file_name, mime_type, byte_size, created_at
        FROM assets WHERE file_name = ?
      `, [saved.fileName])
      if (!row)
        throw new Error(`Failed to read registered Asset: ${saved.fileName}`)
      return toStoredAsset(row)
    })
  }

  releaseClaim(input: { fileName: string }): Promise<void> {
    validateAssetFileName(input.fileName)
    return this.#runOperation(async () => {
      await this.#database.run(
        'UPDATE assets SET deletion_claimed_at = NULL WHERE file_name = ?',
        [input.fileName],
      )
    })
  }
}
