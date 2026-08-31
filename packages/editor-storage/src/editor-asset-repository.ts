import type { EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from './database-driver'
import type { AppendLocalAssetSyncManifestInput, AssetStatistics, AssetSyncManifest, RegisterAssetInput, StoredAsset } from './editor-storage-contracts'
import type { AssetRow } from './editor-storage-rows'
import { and, asc, eq, isNotNull, isNull, lte, max, notExists, sql } from 'drizzle-orm'
import { assets, assetSyncManifests, noteAssetReferences } from './drizzle-schema'
import { assertNonEmpty } from './editor-storage-shared'

interface EditorAssetRepositoryDependencies {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

function sameSyncManifest(left: AssetSyncManifest, right: AssetSyncManifest): boolean {
  return left.id === right.id
    && left.deviceId === right.deviceId
    && left.sequence === right.sequence
    && left.fileName === right.fileName
    && left.originalFileName === right.originalFileName
    && left.operation === right.operation
    && left.contentHash === right.contentHash
    && left.contentLength === right.contentLength
    && left.contentType === right.contentType
    && left.createdAt === right.createdAt
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
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #runOperation: EditorAssetRepositoryDependencies['runOperation']

  constructor(dependencies: EditorAssetRepositoryDependencies) {
    this.#orm = dependencies.database.drizzle
    this.#runOperation = dependencies.runOperation
  }

  appendLocalSyncManifest(input: AppendLocalAssetSyncManifestInput): Promise<AssetSyncManifest> {
    return this.#runOperation(async () => this.#orm.transaction((transaction) => {
      const current = transaction.select({ sequence: max(assetSyncManifests.sequence) })
        .from(assetSyncManifests)
        .where(eq(assetSyncManifests.deviceId, input.deviceId))
        .get()
      const sequence = (current?.sequence ?? 0) + 1
      const manifest: AssetSyncManifest = {
        ...input,
        id: `${input.deviceId}:asset:${sequence}`,
        sequence,
      }
      transaction.insert(assetSyncManifests).values(manifest).run()
      return manifest
    }))
  }

  claimUnreferenced(input: { fileName: string, unreferencedBefore: number }): Promise<StoredAsset | null> {
    validateAssetFileName(input.fileName)
    if (!Number.isFinite(input.unreferencedBefore))
      return Promise.reject(new TypeError('Asset reference cutoff must be finite'))
    return this.#runOperation(async () => {
      const rows = this.#orm.update(assets)
        .set({ deletionClaimedAt: Date.now() })
        .where(and(
          eq(assets.fileName, input.fileName),
          lte(assets.unreferencedAt, input.unreferencedBefore),
          isNull(assets.deletionClaimedAt),
          notExists(this.#orm.select({ fileName: noteAssetReferences.assetFileName })
            .from(noteAssetReferences)
            .where(eq(noteAssetReferences.assetFileName, assets.fileName))),
        ))
        .returning({
          file_name: assets.fileName,
          original_file_name: assets.originalFileName,
          mime_type: assets.mimeType,
          byte_size: assets.byteSize,
          created_at: assets.createdAt,
        })
        .all() as AssetRow[]
      const row = rows[0]
      return row ? toStoredAsset(row) : null
    })
  }

  completeDeletion(input: { fileName: string }): Promise<void> {
    validateAssetFileName(input.fileName)
    return this.#runOperation(async () => {
      this.#orm.delete(assets)
        .where(and(
          eq(assets.fileName, input.fileName),
          isNotNull(assets.deletionClaimedAt),
          notExists(this.#orm.select({ fileName: noteAssetReferences.assetFileName })
            .from(noteAssetReferences)
            .where(eq(noteAssetReferences.assetFileName, assets.fileName))),
        ))
        .run()
    })
  }

  getStatistics(): Promise<AssetStatistics> {
    return this.#runOperation(async () => {
      const row = this.#orm.select({
        managed_asset_count: sql<number>`count(*)`.as('managed_asset_count'),
      }).from(assets).get()
      const references = this.#orm.select({
        reference_count: sql<number>`coalesce(sum(${noteAssetReferences.referenceCount}), 0)`.as('reference_count'),
      }).from(noteAssetReferences).get()
      if (!row)
        throw new Error('Failed to read Asset statistics')
      return {
        managedAssetCount: row.managed_asset_count,
        referenceCount: references?.reference_count ?? 0,
      }
    })
  }

  getSyncFrontier(): Promise<Readonly<Record<string, number>>> {
    return this.#runOperation(async () => {
      const rows = this.#orm.select({
        deviceId: assetSyncManifests.deviceId,
        sequence: max(assetSyncManifests.sequence),
      }).from(assetSyncManifests).groupBy(assetSyncManifests.deviceId).all()
      return Object.fromEntries(rows.map(row => [row.deviceId, row.sequence ?? 0]))
    })
  }

  list(): Promise<readonly StoredAsset[]> {
    return this.#runOperation(async () => {
      const rows = this.#orm.select({
        file_name: assets.fileName,
        original_file_name: assets.originalFileName,
        mime_type: assets.mimeType,
        byte_size: assets.byteSize,
        created_at: assets.createdAt,
      }).from(assets).orderBy(asc(assets.createdAt), asc(assets.fileName)).all() as AssetRow[]
      return rows.map(toStoredAsset)
    })
  }

  listClaimed(): Promise<readonly StoredAsset[]> {
    return this.#runOperation(async () => {
      const rows = this.#orm.select({
        file_name: assets.fileName,
        original_file_name: assets.originalFileName,
        mime_type: assets.mimeType,
        byte_size: assets.byteSize,
        created_at: assets.createdAt,
      }).from(assets).where(isNotNull(assets.deletionClaimedAt)).orderBy(asc(assets.createdAt), asc(assets.fileName)).all() as AssetRow[]
      return rows.map(toStoredAsset)
    })
  }

  listUnreferenced(input: { unreferencedBefore: number }): Promise<readonly StoredAsset[]> {
    if (!Number.isFinite(input.unreferencedBefore))
      return Promise.reject(new TypeError('Asset reference cutoff must be finite'))
    return this.#runOperation(async () => {
      const rows = this.#orm.select({
        file_name: assets.fileName,
        original_file_name: assets.originalFileName,
        mime_type: assets.mimeType,
        byte_size: assets.byteSize,
        created_at: assets.createdAt,
      }).from(assets).where(and(
        lte(assets.unreferencedAt, input.unreferencedBefore),
        isNull(assets.deletionClaimedAt),
        notExists(this.#orm.select({ fileName: noteAssetReferences.assetFileName })
          .from(noteAssetReferences)
          .where(eq(noteAssetReferences.assetFileName, assets.fileName))),
      )).orderBy(asc(assets.createdAt), asc(assets.fileName)).all() as AssetRow[]
      return rows.map(toStoredAsset)
    })
  }

  listSyncManifests(since: Readonly<Record<string, number>>): Promise<readonly AssetSyncManifest[]> {
    return this.#runOperation(async () => this.#orm.select().from(assetSyncManifests).orderBy(asc(assetSyncManifests.createdAt), asc(assetSyncManifests.deviceId), asc(assetSyncManifests.sequence)).all().filter(manifest => manifest.sequence > (since[manifest.deviceId] ?? 0)))
  }

  recordReceivedSyncManifests(manifests: readonly AssetSyncManifest[]): Promise<void> {
    return this.#runOperation(async () => this.#orm.transaction((transaction) => {
      for (const manifest of manifests) {
        const byId = transaction.select().from(assetSyncManifests).where(eq(assetSyncManifests.id, manifest.id)).get()
        const bySequence = transaction.select().from(assetSyncManifests).where(and(
          eq(assetSyncManifests.deviceId, manifest.deviceId),
          eq(assetSyncManifests.sequence, manifest.sequence),
        )).get()
        for (const existing of [byId, bySequence]) {
          if (existing !== undefined && !sameSyncManifest(existing, manifest))
            throw new Error('Asset sync manifest idempotency conflict')
        }
        if (byId === undefined && bySequence === undefined)
          transaction.insert(assetSyncManifests).values(manifest).run()
      }
    }))
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
      this.#orm.insert(assets).values({
        fileName: saved.fileName,
        originalFileName: saved.originalFileName,
        mimeType: saved.mimeType,
        byteSize: saved.byteSize,
        createdAt,
        unreferencedAt: createdAt,
      }).onConflictDoNothing().run()
      const row = this.#orm.select({
        file_name: assets.fileName,
        original_file_name: assets.originalFileName,
        mime_type: assets.mimeType,
        byte_size: assets.byteSize,
        created_at: assets.createdAt,
      }).from(assets).where(eq(assets.fileName, saved.fileName)).get() as AssetRow | undefined
      if (!row)
        throw new Error(`Failed to read registered Asset: ${saved.fileName}`)
      return toStoredAsset(row)
    })
  }

  releaseClaim(input: { fileName: string }): Promise<void> {
    validateAssetFileName(input.fileName)
    return this.#runOperation(async () => {
      this.#orm.update(assets)
        .set({ deletionClaimedAt: null })
        .where(eq(assets.fileName, input.fileName))
        .run()
    })
  }
}
