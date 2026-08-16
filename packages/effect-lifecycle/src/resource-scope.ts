import { Cause, Effect, Exit, FiberSet, Scope } from 'effect'
import { combineLifecycleFailures, createRetryableClose, toError } from './errors'

export interface ScopedResource<Resource> {
  acquire: () => Promise<Resource> | Resource
  close: (resource: Resource) => Promise<void> | void
  name: string
}

export interface AcquiredResource<Resource> {
  resource: Resource
  transfer: () => void
}

export interface ResourceScope {
  acquire: <Resource>(resource: ScopedResource<Resource>) => Promise<AcquiredResource<Resource>>
  close: () => Promise<void>
  commit: () => void
  /** True once shutdown or rollback begins; commit only seals acquisition. */
  isClosed: () => boolean
  own: (resource: ResourceFinalizerEntry) => void
  rollback: (startupError: unknown) => Promise<never>
}

export interface ResourceFinalizerEntry {
  close: () => Promise<void> | void
  name: string
}

export interface ResourceScopeOptions {
  closeMode?: 'aggregate' | 'dependent'
}

interface Finalizer {
  active: boolean
  close: () => Promise<void> | void
  name: string
}

type ResourceScopeState = 'acquiring' | 'committed' | 'closing'

function sealedScopeError(name: string, state: Exclude<ResourceScopeState, 'acquiring'>): Error {
  return new Error(`${name} resource scope is ${state === 'closing' ? 'closed' : 'committed'}`)
}

function closeFinalizer(finalizer: Finalizer): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    catch: error => error instanceof AggregateError
      ? error
      : new Error(`Failed to close ${finalizer.name}`, { cause: error }),
    try: async () => finalizer.close(),
  }).pipe(
    Effect.tap(() => Effect.sync(() => {
      finalizer.active = false
    })),
  )
}

function closeFailure(name: string, cause: Cause.Cause<never>, aggregate: boolean): Error {
  const failures = cause.reasons
    .filter(Cause.isDieReason)
    .flatMap((reason) => {
      if (reason.defect instanceof AggregateError)
        return reason.defect.errors.map(error => error instanceof Error ? error : new Error(String(error)))
      return [reason.defect instanceof Error ? reason.defect : new Error(String(reason.defect))]
    })
  return combineLifecycleFailures(failures, `${name} resource cleanup failed`, {
    alwaysAggregate: aggregate,
  })
}

export function createResourceScope(
  name: string,
  options: ResourceScopeOptions = {},
): ResourceScope {
  const finalizers: Finalizer[] = []
  const acquisitionScope = Scope.makeUnsafe('sequential')
  const acquisitions = Effect.runSync(Scope.provide(FiberSet.make(), acquisitionScope))
  const runAcquisition = Effect.runSync(FiberSet.runtimePromise(acquisitions)<never>())
  let state: ResourceScopeState = 'acquiring'
  let shutdownCloseMode: NonNullable<ResourceScopeOptions['closeMode']> | undefined
  const retryableClose = createRetryableClose()

  const own = (resource: ResourceFinalizerEntry): void => {
    if (state !== 'acquiring')
      throw sealedScopeError(name, state)
    // Explicit shutdown steps are declared in execution order. Acquired
    // resources still use stack order through `acquire`.
    finalizers.unshift({ ...resource, active: true })
  }

  const acquire = <Resource>(resource: ScopedResource<Resource>): Promise<AcquiredResource<Resource>> => {
    if (state !== 'acquiring')
      return Promise.reject(sealedScopeError(name, state))
    return runAcquisition(Effect.tryPromise({
      catch: toError,
      try: () => Promise.resolve(resource.acquire()),
    }).pipe(Effect.map((acquired) => {
      const finalizer: Finalizer = {
        active: true,
        close: () => resource.close(acquired),
        name: resource.name,
      }
      finalizers.push(finalizer)
      return {
        resource: acquired,
        transfer: () => {
          if (!finalizer.active)
            return
          if (state !== 'acquiring')
            throw sealedScopeError(name, state)
          finalizer.active = false
        },
      }
    })))
  }

  const commit = (): void => {
    if (state !== 'acquiring')
      throw sealedScopeError(name, state)
    state = 'committed'
  }

  const closeResources = (
    closeMode: NonNullable<ResourceScopeOptions['closeMode']>,
  ): Effect.Effect<void> => {
    const active = finalizers.filter(finalizer => finalizer.active)
    if (closeMode === 'dependent') {
      return Effect.gen(function* () {
        for (const finalizer of active.reverse())
          yield* closeFinalizer(finalizer)
      }).pipe(Effect.catchEager(Effect.die))
    }

    const finalizerScope = Scope.makeUnsafe('sequential')
    for (const finalizer of active) {
      Effect.runSync(Scope.addFinalizer(
        finalizerScope,
        closeFinalizer(finalizer).pipe(Effect.catchEager(Effect.die)),
      ))
    }
    return Scope.close(finalizerScope, Exit.void)
  }

  const closeAttempt = async (
    closeMode: NonNullable<ResourceScopeOptions['closeMode']>,
  ): Promise<void> => {
    const exit = await Effect.runPromiseExit(Effect.gen(function* () {
      yield* FiberSet.awaitEmpty(acquisitions)
      yield* Scope.close(acquisitionScope, Exit.void)
      yield* closeResources(closeMode)
    }))
    if (Exit.isFailure(exit))
      throw closeFailure(name, exit.cause, closeMode === 'aggregate')
  }

  const close = (): Promise<void> => {
    // Closing an uncommitted scope is startup rollback, even when cancellation
    // reaches `close` before the acquisition catch reaches `rollback`.
    shutdownCloseMode ??= state === 'committed'
      ? options.closeMode ?? 'aggregate'
      : 'aggregate'
    state = 'closing'
    return retryableClose(() => closeAttempt(shutdownCloseMode!))
  }

  const rollback = async (startupError: unknown): Promise<never> => {
    const normalizedStartupError = toError(startupError)
    try {
      // Startup rollback has no live dependents to preserve. Always attempt
      // every acquired finalizer so a failure cannot leak earlier resources.
      // `close` also shares cancellation-triggered rollback already in flight.
      await close()
    }
    catch (cleanupError) {
      throw combineLifecycleFailures(
        [normalizedStartupError, cleanupError],
        `${name} startup and resource rollback failed`,
      )
    }
    throw normalizedStartupError
  }

  return { acquire, close, commit, isClosed: () => state === 'closing', own, rollback }
}
