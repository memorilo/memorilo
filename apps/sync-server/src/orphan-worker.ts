import type { SyncObjectStore, SyncRepository } from '@memorilo/sync'
import { toError } from '@memorilo/effect-lifecycle'
import { Effect } from 'effect'
import { createPeriodicWorker } from './periodic-worker'

export interface OrphanWorker {
  readonly close: () => Promise<void>
  readonly runNow: () => Promise<void>
}

export interface OrphanWorkerOptions {
  readonly graceMs: number
  readonly intervalMs: number
  readonly objectStore: SyncObjectStore
  readonly repository: SyncRepository
  readonly now?: () => number
}

export function createOrphanWorker(options: OrphanWorkerOptions): OrphanWorker {
  const now = options.now ?? Date.now

  const reconcileAccount = (accountId: string, generation: number, cutoff: number, isClosed: () => boolean): Effect.Effect<void, Error> => {
    const reconcileMetadata = (cursor?: string): Effect.Effect<void, Error> => Effect.gen(function* () {
      if (isClosed())
        return
      const batch = yield* Effect.tryPromise({ catch: toError, try: () => options.repository.listObjectMetadata(accountId, generation, 100, cursor) })
      if (batch.length === 0)
        return
      yield* Effect.forEach(batch, metadata => Effect.gen(function* () {
        const [stored, referenced] = yield* Effect.all([
          Effect.tryPromise({ catch: toError, try: () => options.objectStore.head(accountId, metadata.key) }),
          Effect.tryPromise({ catch: toError, try: () => options.repository.isObjectReferenced(accountId, generation, metadata.contentHash) }),
        ], { concurrency: 'unbounded' })
        if (stored === null && referenced) {
          yield* Effect.sync(() => console.error('Sync object integrity failure', { accountId, contentHash: metadata.contentHash, generation }))
          return
        }
        if (!referenced && metadata.createdAt <= cutoff) {
          yield* Effect.tryPromise({ catch: toError, try: () => options.objectStore.delete(accountId, metadata.key) })
          yield* Effect.tryPromise({ catch: toError, try: () => options.repository.deleteObjectMetadata(accountId, generation, metadata.contentHash) })
        }
      }), { concurrency: 1 })
      if (batch.length === 100)
        yield* reconcileMetadata(batch.at(-1)?.key)
    })
    const reconcileObjects = (cursor?: string): Effect.Effect<void, Error> => Effect.gen(function* () {
      if (isClosed())
        return
      const page = yield* Effect.tryPromise({ catch: toError, try: () => options.objectStore.list(accountId, cursor, 100) })
      yield* Effect.forEach(page.items, object => Effect.gen(function* () {
        if (object.createdAt > cutoff)
          return
        const metadata = yield* Effect.tryPromise({ catch: toError, try: () => options.repository.getObjectMetadata(accountId, object.generation, object.contentHash) })
        if (metadata === null)
          yield* Effect.tryPromise({ catch: toError, try: () => options.objectStore.delete(accountId, object.key) })
      }), { concurrency: 1 })
      if (page.cursor !== null)
        yield* reconcileObjects(page.cursor)
    })
    return Effect.gen(function* () {
      yield* reconcileMetadata()
      yield* reconcileObjects()
    })
  }

  const run = (isClosed: () => boolean): Effect.Effect<void, Error> => Effect.gen(function* () {
    const cutoff = now() - options.graceMs
    const accounts = yield* Effect.tryPromise({ catch: toError, try: () => options.repository.listAccountStates() })
    yield* Effect.forEach(accounts, account => reconcileAccount(account.accountId, account.generation, cutoff, isClosed), { concurrency: 1 })
  })
  return createPeriodicWorker({
    intervalMs: options.intervalMs,
    name: 'Sync orphan reconciliation worker',
    run,
  })
}
