import type { Effect as EffectType } from 'effect'
import { createOperationSupervisor } from '@memorilo/effect-lifecycle'
import { Duration, Effect, Schedule } from 'effect'

export interface PeriodicWorker {
  readonly close: () => Promise<void>
  readonly runNow: () => Promise<void>
}

export interface PeriodicWorkerOptions {
  readonly intervalMs: number
  readonly name: string
  readonly onError?: (error: unknown) => void
  readonly run: (isClosed: () => boolean) => EffectType.Effect<void, Error>
}

export function createPeriodicWorker(options: PeriodicWorkerOptions): PeriodicWorker {
  const supervisor = createOperationSupervisor(options.name, {
    concurrency: 'unbounded',
    shutdown: 'interrupt',
  })
  let activeRun: Promise<void> | null = null
  const reportError = options.onError ?? (error => console.error(`${options.name} failed`, error))

  const runNow = (): Promise<void> => {
    if (supervisor.isClosed())
      return Promise.resolve()
    if (activeRun !== null)
      return activeRun
    const operation = supervisor.runEffectSingleFlight(options.run(supervisor.isClosed))
      .then(result => result.status === 'accepted' ? result.value : undefined)
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

  const periodic = Effect.repeat(
    Effect.sync(() => {
      void runNow().catch(reportError)
    }),
    Schedule.spaced(Duration.millis(options.intervalMs)),
  )
  void supervisor.runEffect(periodic).catch((error) => {
    if (!supervisor.isClosed())
      reportError(error)
  })

  return {
    close: supervisor.close,
    runNow,
  }
}
