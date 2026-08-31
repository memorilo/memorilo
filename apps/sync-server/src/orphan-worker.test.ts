import type { SyncAssetManifest, SyncObjectMetadata } from '@memorilo/sync'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { objectKeyFor } from '@memorilo/sync'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { createSqliteSyncDatabase } from '../infrastructure/database/sqlite'
import { createFilesystemObjectStore } from '../infrastructure/object-store/filesystem'
import { createOrphanWorker } from './orphan-worker'

describe('sync object orphan reconciliation', () => {
  async function withFixture<Result>(use: (fixture: {
    readonly database: ReturnType<typeof createSqliteSyncDatabase>
    readonly objectStore: ReturnType<typeof createFilesystemObjectStore>
  }) => Promise<Result>): Promise<Result> {
    return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.tryPromise({
          catch: error => error instanceof Error ? error : new Error(String(error)),
          try: () => mkdtemp(join(tmpdir(), 'memorilo-orphan-worker-test-')),
        }),
        path => Effect.promise(() => rm(path, { force: true, recursive: true })),
      )
      const database = yield* Effect.acquireRelease(
        Effect.sync(() => createSqliteSyncDatabase({ filename: join(directory, 'sync.sqlite') })),
        current => Effect.sync(current.close),
      )
      yield* Effect.sync(database.migrate)
      const objectStore = yield* Effect.acquireRelease(
        Effect.sync(() => createFilesystemObjectStore({ root: join(directory, 'objects') })),
        current => Effect.promise(() => Promise.resolve(current.close())),
      )
      yield* Effect.promise(() => database.repository.createAccount({ accountId: 'account-1', enabledModes: ['authoritative'] }))
      return yield* Effect.promise(() => use({ database, objectStore }))
    })))
  }

  async function storeObject(
    objectStore: ReturnType<typeof createFilesystemObjectStore>,
    repository: ReturnType<typeof createSqliteSyncDatabase>['repository'],
    id: string,
  ): Promise<{ readonly manifest: SyncAssetManifest, readonly metadata: SyncObjectMetadata }> {
    const bytes = new TextEncoder().encode(id)
    const contentHash = createHash('sha256').update(bytes).digest('hex')
    const metadata: SyncObjectMetadata = {
      accountId: 'account-1',
      contentHash,
      contentLength: bytes.byteLength,
      contentType: 'text/plain',
      createdAt: 1,
      generation: 0,
      key: objectKeyFor('account-1', 0, contentHash),
      namespace: 'assets',
    }
    await objectStore.putImmutable(metadata, (async function* () {
      yield bytes
    })())
    await repository.putObjectMetadata(metadata)
    return {
      manifest: {
        contentHash,
        contentLength: bytes.byteLength,
        contentType: 'text/plain',
        createdAt: 1,
        deviceId: 'device-1',
        fileName: `${id}.txt`,
        id,
        operation: 'put',
        originalFileName: `${id}.txt`,
        sequence: id === 'referenced' ? 1 : 2,
      },
      metadata,
    }
  }

  it('deletes expired unreferenced objects and preserves committed manifests', async () => {
    await withFixture(async ({ database, objectStore }) => {
      const orphan = await storeObject(objectStore, database.repository, 'orphan')
      const referenced = await storeObject(objectStore, database.repository, 'referenced')
      await database.repository.appendAssetManifests('account-1', 0, [referenced.manifest])
      const worker = createOrphanWorker({
        graceMs: 100,
        intervalMs: 60_000,
        now: () => 1_000,
        objectStore,
        repository: database.repository,
      })
      try {
        await worker.runNow()

        await expect(database.repository.getObjectMetadata('account-1', 0, orphan.metadata.contentHash)).resolves.toBeNull()
        await expect(objectStore.head('account-1', orphan.metadata.key)).resolves.toBeNull()
        await expect(database.repository.getObjectMetadata('account-1', 0, referenced.metadata.contentHash)).resolves.toEqual(referenced.metadata)
        await expect(objectStore.head('account-1', referenced.metadata.key)).resolves.toEqual(referenced.metadata)
      }
      finally {
        await worker.close()
      }
    })
  })
})
