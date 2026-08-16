import { Effect, Exit, Fiber, FiberMap, FiberSet, Scope, Semaphore } from 'effect'
import { createRetryableClose, toError } from './errors'

export type LatestOperationResult<Result>
  = | { status: 'current', value: Result }
    | { status: 'superseded' }

export interface LatestOperationContext {
  isCurrent: () => boolean
  signal: AbortSignal
}

export interface LatestOperationRunOptions<Result> {
  onSuperseded?: (value: Result) => Promise<void> | void
}

/** Controls whether unrelated channels share one admission permit. */
export interface LatestOperationSupervisorOptions {
  readonly abortReason?: () => unknown
  readonly closedError?: () => Error
  readonly concurrency?: 'serial' | 'parallel'
  readonly shutdown?: 'drain' | 'interrupt'
}

export interface LatestOperationSupervisor<Channel extends PropertyKey> {
  close: () => Promise<void>
  invalidate: (channel: Channel) => void
  run: <Result>(
    channel: Channel,
    operation: (context: LatestOperationContext) => Promise<Result>,
    options?: LatestOperationRunOptions<Result>,
  ) => Promise<LatestOperationResult<Result>>
}

/**
 * Owns one current Effect fiber per channel. Replacing or invalidating a
 * channel interrupts that fiber and aborts its operation signal. Accepted
 * promises remain owned until they settle so obsolete resource values can be
 * reclaimed even when the underlying transport cannot be cancelled.
 */
export function createLatestOperationSupervisor<Channel extends PropertyKey>(
  name: string,
  options: LatestOperationSupervisorOptions = {},
): LatestOperationSupervisor<Channel> {
  const closedError = options.closedError ?? (() => new Error(`${name} is closed`))
  const concurrency = options.concurrency ?? 'serial'
  const scope = Scope.makeUnsafe('sequential')
  const fibers = Effect.runSync(Scope.provide(FiberMap.make<Channel>(), scope))
  const promises = Effect.runSync(Scope.provide(FiberSet.make(), scope))
  const runFiber = Effect.runSync(FiberMap.runtime(fibers)<never>())
  const runPromise = Effect.runSync(FiberSet.runtimePromise(promises)<never>())
  const admission = concurrency === 'serial' ? Semaphore.makeUnsafe(1) : undefined
  const shutdownController = new AbortController()
  let accepting = true
  const retryableClose = createRetryableClose()

  const invalidate = (channel: Channel): void => {
    if (!accepting)
      return
    // Installing a completed sentinel synchronously replaces and interrupts
    // the current fiber without leaving an idle task in the map.
    runFiber(channel, Effect.void)
  }

  const run = <Result>(
    channel: Channel,
    operation: (context: LatestOperationContext) => Promise<Result>,
    runOptions: LatestOperationRunOptions<Result> = {},
  ): Promise<LatestOperationResult<Result>> => {
    if (!accepting)
      return Promise.reject(closedError())

    let fiber: Fiber.Fiber<LatestOperationResult<Result>, Error>
    let ownedPromise: Promise<LatestOperationResult<Result>> | undefined
    const isCurrent = (): boolean => accepting
      && (fiber === undefined || FiberMap.getUnsafe(fibers, channel) === fiber)

    const effect: Effect.Effect<LatestOperationResult<Result>, Error> = Effect.tryPromise({
      catch: toError,
      try: (fiberSignal) => {
        const ownedEffect: Effect.Effect<LatestOperationResult<Result>, Error> = Effect.tryPromise({
          catch: toError,
          try: async (ownedSignal) => {
            const signal = AbortSignal.any([
              fiberSignal,
              ownedSignal,
              shutdownController.signal,
            ])
            let value: Result
            try {
              signal.throwIfAborted()
              value = await operation({ isCurrent, signal })
            }
            catch (error) {
              if (!isCurrent())
                return { status: 'superseded' }
              throw error
            }
            if (!isCurrent()) {
              await runOptions.onSuperseded?.(value)
              return { status: 'superseded' } satisfies LatestOperationResult<Result>
            }
            return { status: 'current', value } satisfies LatestOperationResult<Result>
          },
        })
        ownedPromise = runPromise(admission ? admission.withPermit(ownedEffect) : ownedEffect)
        return ownedPromise!
      },
    })

    fiber = runFiber(channel, effect)
    return Effect.runPromise(Fiber.join(fiber)).catch((error) => {
      if (isCurrent())
        throw error
      // Fiber interruption is immediate, but an accepted Promise may still
      // produce a resource. Wait for its stale-value finalizer before resolving.
      return ownedPromise ?? { status: 'superseded' }
    })
  }

  const close = (): Promise<void> => {
    accepting = false
    if (options.shutdown === 'interrupt' && !shutdownController.signal.aborted) {
      shutdownController.abort(
        options.abortReason?.() ?? new Error(`${name} interrupted`),
      )
    }

    return retryableClose(() => Effect.runPromise(Effect.gen(function* () {
      if (options.shutdown === 'interrupt') {
        yield* FiberMap.clear(fibers)
      }
      yield* FiberSet.awaitEmpty(promises)
      yield* FiberMap.awaitEmpty(fibers)
      yield* Scope.close(scope, Exit.void)
    })))
  }

  return { close, invalidate, run }
}
