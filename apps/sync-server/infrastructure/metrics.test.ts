import type { SyncPeerMetricsRecorder } from './metrics'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'
import { withDatabaseFailureMetrics } from './metrics'

function failure(name: string, code?: string): Error {
  const error = new Error(name)
  error.name = name
  if (code !== undefined)
    Reflect.set(error, 'code', code)
  return error
}

describe('database failure metrics', () => {
  it('counts provider failures without treating domain rejections as database outages', async () => {
    let databaseFailures = 0
    const recorder = {
      authoritativeCommit: () => undefined,
      databaseFailure: () => { databaseFailures += 1 },
      objectStoreFailure: () => undefined,
      quotaRejected: () => undefined,
      relayDelivered: () => undefined,
      relayDropped: () => undefined,
      relayFailed: () => undefined,
      resetJobs: () => undefined,
    } satisfies SyncPeerMetricsRecorder
    const service = withDatabaseFailureMetrics({
      domainConflict: async () => { throw new Error('Sync account policy changed or does not exist') },
      postgresConnection: async () => { throw failure('Error', 'ECONNREFUSED') },
      postgresConstraint: async () => { throw failure('PostgresError', '23505') },
      sqliteConstraint: async () => { throw failure('SqliteError', 'SQLITE_CONSTRAINT_UNIQUE') },
      sqliteFailure: async () => { throw failure('SqliteError', 'SQLITE_IOERR') },
    }, recorder)

    const exits = await Effect.runPromise(Effect.all([
      Effect.promise(service.domainConflict).pipe(Effect.exit),
      Effect.promise(service.postgresConnection).pipe(Effect.exit),
      Effect.promise(service.postgresConstraint).pipe(Effect.exit),
      Effect.promise(service.sqliteConstraint).pipe(Effect.exit),
      Effect.promise(service.sqliteFailure).pipe(Effect.exit),
    ], { concurrency: 'unbounded' }))

    expect(exits.every(Exit.isFailure)).toBe(true)
    expect(databaseFailures).toBe(2)
  })
})
