import type { Effect as EffectType } from 'effect'
import { Effect, Exit, FiberSet, Scope, Semaphore } from 'effect'
import { createRetryableClose, toError } from './errors'

export type SingleFlightResult<Result>
  = | { status: 'accepted', value: Result }
    | { status: 'busy' }

export interface OperationSupervisor {
  close: () => Promise<void>
  /** Reports whether new operations are rejected. */
  isClosed: () => boolean
  /** Runs an Effect inside the supervisor-owned fiber set. */
  runEffect: <Result, Failure = never>(effect: EffectType.Effect<Result, Failure>) => Promise<Result>
  run: <Result>(operation: (signal: AbortSignal) => Promise<Result>) => Promise<Result>
  /** Rejects overlap before serial queueing and returns busy without starting it. */
  runSingleFlight: <Result>(operation: (signal: AbortSignal) => Promise<Result>) => Promise<SingleFlightResult<Result>>
}

export interface OperationSupervisorOptions {
  readonly abortReason?: () => unknown
  readonly closedError?: () => Error
  readonly concurrency?: 'serial' | 'unbounded'
  readonly shutdown?: 'drain' | 'interrupt'
}

/**
 * Owns operation admission and shutdown draining. Serial supervisors use an
 * Effect semaphore so queued operations share one permit and release it on
 * every exit. Unbounded supervisors start accepted operations immediately and
 * retain lifecycle ownership without adding artificial ordering.
 */
export function createOperationSupervisor(
  name: string,
  options: OperationSupervisorOptions = {},
): OperationSupervisor {
  const closedError = options.closedError ?? (() => new Error(`${name} is closed`))
  const concurrency = options.concurrency ?? 'serial'
  const shutdown = options.shutdown ?? 'drain'
  const semaphore = Semaphore.makeUnsafe(1)
  const scope = Scope.makeUnsafe('sequential')
  // Promise-backed work must outlive interruption of its adapter fiber so
  // shutdown can drain transports that ignore AbortSignal. Native Effects can
  // be interrupted directly. Keeping the sets separate preserves both models.
  const promiseFibers = Effect.runSync(Scope.provide(FiberSet.make(), scope))
  const effectFibers = Effect.runSync(Scope.provide(FiberSet.make(), scope))
  const runOwnedPromise = Effect.runSync(FiberSet.runtimePromise(promiseFibers)<never>())
  const runOwnedEffect = Effect.runSync(FiberSet.runtimePromise(effectFibers)<never>())
  const controller = new AbortController()
  let closed = false
  const retryableClose = createRetryableClose()
  let singleFlightBusy = false

  const runOwned = <Result, Failure>(effect: Effect.Effect<Result, Failure>): Promise<Result> => {
    if (closed)
      return Promise.reject(closedError())
    return runOwnedPromise(concurrency === 'serial' ? semaphore.withPermit(effect) : effect)
  }

  const runEffect = <Result, Failure>(effect: Effect.Effect<Result, Failure>): Promise<Result> => {
    if (closed)
      return Promise.reject(closedError())
    const normalized = effect.pipe(Effect.mapError(toError))
    return runOwnedEffect(concurrency === 'serial' ? semaphore.withPermit(normalized) : normalized)
  }

  const run = <Result>(operation: (signal: AbortSignal) => Promise<Result>): Promise<Result> => {
    return runOwned(Effect.tryPromise({
      catch: toError,
      try: () => {
        controller.signal.throwIfAborted()
        return operation(controller.signal)
      },
    }))
  }

  const runSingleFlight = <Result>(
    operation: (signal: AbortSignal) => Promise<Result>,
  ): Promise<SingleFlightResult<Result>> => {
    if (closed)
      return Promise.reject(closedError())
    if (singleFlightBusy)
      return Promise.resolve({ status: 'busy' })
    singleFlightBusy = true
    return runOwned(Effect.tryPromise({
      catch: toError,
      try: () => {
        controller.signal.throwIfAborted()
        return operation(controller.signal)
      },
    })).then(
      (value): SingleFlightResult<Result> => {
        singleFlightBusy = false
        return { status: 'accepted', value }
      },
      (error) => {
        singleFlightBusy = false
        throw error
      },
    )
  }

  const close = (): Promise<void> => {
    closed = true
    if (shutdown === 'interrupt' && !controller.signal.aborted)
      controller.abort(options.abortReason?.() ?? new Error(`${name} interrupted`))
    return retryableClose(() => Effect.runPromise(Effect.gen(function* () {
      if (shutdown === 'interrupt')
        yield* FiberSet.clear(effectFibers)
      yield* FiberSet.awaitEmpty(promiseFibers)
      yield* FiberSet.awaitEmpty(effectFibers)
      yield* Scope.close(scope, Exit.void)
    })))
  }

  return { close, isClosed: () => closed, run, runEffect, runSingleFlight }
}
