import type { SyncObjectStore, SyncRepository, SyncResetJob } from '@memorilo/sync'
import type { SyncPeerMetricsRecorder } from './metrics'
import { randomUUID } from 'node:crypto'
import { createOperationSupervisor, toError } from '@memorilo/effect-lifecycle'
import { Duration, Effect } from 'effect'

export interface ResetWorker {
  readonly runNow: () => Promise<void>
  readonly close: () => Promise<void>
}

export interface ResetWorkerOptions {
  readonly repository: SyncRepository
  readonly objectStore: SyncObjectStore
  readonly intervalMs?: number
  readonly leaseDurationMs?: number
  readonly now?: () => number
  readonly metrics?: SyncPeerMetricsRecorder
}

function clearResetGeneration(
  job: SyncResetJob,
  repository: SyncRepository,
  objectStore: SyncObjectStore,
): Effect.Effect<void, Error> {
  const clearBatch = (): Effect.Effect<void, Error> => Effect.gen(function* () {
    const objects = yield* Effect.tryPromise({ catch: toError, try: () => repository.listObjectMetadata(job.accountId, job.generation, 100) })
    if (objects.length === 0)
      return
    yield* Effect.forEach(objects, metadata => Effect.gen(function* () {
      yield* Effect.tryPromise({ catch: toError, try: () => objectStore.delete(job.accountId, metadata.key) })
      yield* Effect.tryPromise({ catch: toError, try: () => repository.deleteObjectMetadata(job.accountId, job.generation, metadata.contentHash) })
    }), { concurrency: 1 })
    yield* clearBatch()
  })
  return Effect.gen(function* () {
    yield* clearBatch()
    yield* Effect.tryPromise({ catch: toError, try: () => repository.clearGeneration(job.accountId, job.generation) })
  })
}

export function createResetWorker(options: ResetWorkerOptions): ResetWorker {
  const owner = randomUUID()
  const now = options.now ?? Date.now
  const leaseDurationMs = options.leaseDurationMs ?? 60_000
  const supervisor = createOperationSupervisor('Sync reset worker', { concurrency: 'unbounded', shutdown: 'interrupt' })
  let activeRun: Promise<void> | null = null

  const run = (): Effect.Effect<void, Error> => Effect.gen(function* () {
    const jobs = yield* Effect.tryPromise({
      catch: toError,
      try: async () => options.repository.listResetJobs?.() ?? [],
    })
    const pending = jobs.filter(job => job.status !== 'completed')
    options.metrics?.resetJobs(pending.length, pending.length === 0 ? 0 : Math.max(...pending.map(job => now() - job.createdAt)))

    const processNext = (): Effect.Effect<void, Error> => Effect.gen(function* () {
      if (supervisor.isClosed())
        return
      const job = yield* Effect.tryPromise({
        catch: toError,
        try: () => options.repository.claimResetJob(owner, now(), leaseDurationMs),
      })
      if (job === null)
        return

      const processJob = Effect.gen(function* () {
        yield* clearResetGeneration(job, options.repository, options.objectStore)
        yield* Effect.tryPromise({
          catch: toError,
          try: () => options.repository.completeResetJob(job.id, owner, now()),
        })
        options.metrics?.resetJobs(Math.max(0, pending.length - 1), 0)
        yield* processNext()
      })
      yield* processJob.pipe(Effect.catchEager(error => Effect.tryPromise({
        catch: toError,
        try: () => options.repository.retryResetJob(job.id, owner, error.message),
      })))
    })

    yield* processNext()
  })
  const runNow = (): Promise<void> => {
    if (supervisor.isClosed())
      return Promise.resolve()
    if (activeRun !== null)
      return activeRun
    const operation = supervisor.runEffectSingleFlight(run()).then(result => result.status === 'accepted' ? result.value : undefined)
    activeRun = operation
    void operation.then(
      () => {
        if (activeRun === operation)
          activeRun = null
      },
      () => {
        if (activeRun === operation)
          activeRun = null
      },
    )
    return operation
  }
  const intervalMs = options.intervalMs ?? 5_000
  const periodic = Effect.forever(
    Effect.sync(() => {
      void runNow().catch(error => console.error('Sync reset worker failed', error))
    }).pipe(
      Effect.andThen(Effect.sleep(Duration.millis(intervalMs))),
    ),
  )
  void supervisor.runEffect(periodic).catch((error) => {
    if (!supervisor.isClosed())
      console.error('Sync reset worker failed', error)
  })

  return {
    close: async () => {
      await supervisor.close()
    },
    runNow,
  }
}
