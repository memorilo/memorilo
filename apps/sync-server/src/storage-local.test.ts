import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { objectKeyFor } from '@memorilo/sync'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteSyncDatabase } from '../infrastructure/database/sqlite'
import { createFilesystemObjectStore } from '../infrastructure/object-store/filesystem'
import { verifyStorageConformance } from './storage-conformance'

describe('sqlite and filesystem storage conformance', () => {
  const directories: string[] = []

  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
  })

  it('preserves tenant-scoped changes, objects and audit events across restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-storage-local-'))
    directories.push(directory)
    await verifyStorageConformance({
      createDatabase: () => createSqliteSyncDatabase({ filename: join(directory, 'sync.sqlite') }),
      createObjectStore: () => createFilesystemObjectStore({ root: join(directory, 'objects') }),
    })
  })

  it('removes temporary files when object streaming or validation fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-storage-object-failure-'))
    directories.push(directory)
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const store = yield* Effect.acquireRelease(
        Effect.sync(() => createFilesystemObjectStore({ root: join(directory, 'objects') })),
        current => Effect.promise(() => Promise.resolve(current.close())),
      )
      const bytes = new TextEncoder().encode('durable object')
      const contentHash = createHash('sha256').update(bytes).digest('hex')
      const metadata = {
        accountId: 'account-1',
        contentHash,
        contentLength: bytes.byteLength,
        contentType: 'text/plain',
        createdAt: 1,
        generation: 0,
        key: objectKeyFor('account-1', 0, contentHash),
        namespace: 'assets' as const,
      }
      const failingBefore = (async function* (): AsyncGenerator<Uint8Array> {
        throw new Error('stream failed before first chunk')
      })()
      yield* Effect.promise(() => expect(store.putImmutable(metadata, failingBefore)).rejects.toThrow('stream failed before first chunk'))
      yield* Effect.promise(() => expect(store.head('account-1', metadata.key)).resolves.toBeNull())

      const failingDuring = (async function* (): AsyncGenerator<Uint8Array> {
        yield bytes.subarray(0, 4)
        throw new Error('stream failed during upload')
      })()
      yield* Effect.promise(() => expect(store.putImmutable(metadata, failingDuring)).rejects.toThrow('stream failed during upload'))
      yield* Effect.promise(() => expect(store.head('account-1', metadata.key)).resolves.toBeNull())

      const wrongLength = (async function* (): AsyncGenerator<Uint8Array> {
        yield bytes.subarray(0, bytes.byteLength - 1)
      })()
      yield* Effect.promise(() => expect(store.putImmutable(metadata, wrongLength)).rejects.toThrow('Object length mismatch'))
      yield* Effect.promise(() => expect(store.head('account-1', metadata.key)).resolves.toBeNull())

      const wrongHash = {
        ...metadata,
        contentHash: createHash('sha256').update('different').digest('hex'),
        key: objectKeyFor('account-1', 0, createHash('sha256').update('different').digest('hex')),
      }
      yield* Effect.promise(() => expect(store.putImmutable(wrongHash, (async function* () {
        yield bytes
      })())).rejects.toThrow('Object content hash does not match its manifest'))
      yield* Effect.promise(() => expect(store.head('account-1', wrongHash.key)).resolves.toBeNull())

      yield* Effect.promise(() => expect(store.list('account-1')).resolves.toEqual({ cursor: null, items: [] }))
    })))
  })

  it('allows concurrent idempotent writes of the same object', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-storage-object-concurrency-'))
    directories.push(directory)
    const store = createFilesystemObjectStore({ root: join(directory, 'objects') })
    const bytes = new TextEncoder().encode('concurrent object')
    const contentHash = createHash('sha256').update(bytes).digest('hex')
    const metadata = {
      accountId: 'account-1',
      contentHash,
      contentLength: bytes.byteLength,
      contentType: 'text/plain',
      createdAt: 1,
      generation: 0,
      key: objectKeyFor('account-1', 0, contentHash),
      namespace: 'assets' as const,
    }
    await store.verify()
    await Promise.all([
      store.putImmutable(metadata, (async function* () { yield bytes })()),
      store.putImmutable(metadata, (async function* () { yield bytes })()),
    ])
    await expect(store.head('account-1', metadata.key)).resolves.toMatchObject(metadata)
    store.close()
  })
})
