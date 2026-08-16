import type { Effect as EffectType } from 'effect'
import { combineLifecycleFailures, createOperationSupervisor } from '@memorilo/effect-lifecycle'
import { Effect, Result, Semaphore } from 'effect'

export interface ShelfOperationScope {
  all: <Result, Failure>(
    operations: Iterable<EffectType.Effect<Result, Failure>>,
  ) => EffectType.Effect<readonly Result[], Failure | Error>
  asset: <Result, Failure>(operation: EffectType.Effect<Result, Failure>) => EffectType.Effect<Result, Failure>
  reading: <Result, Failure>(
    readingId: string,
    operation: EffectType.Effect<Result, Failure>,
  ) => EffectType.Effect<Result, Failure | TypeError>
  source: <Result, Failure>(
    sourceId: string,
    operation: EffectType.Effect<Result, Failure>,
  ) => EffectType.Effect<Result, Failure | TypeError>
  sourceExclusive: <Result, Failure>(
    sourceId: string,
    operation: EffectType.Effect<Result, Failure>,
  ) => EffectType.Effect<Result, Failure | TypeError>
}

export interface ShelfOperationRuntime {
  close: () => Promise<void>
  run: <Result, Failure>(operation: (scope: ShelfOperationScope) => EffectType.Effect<Result, Failure>) => Promise<Result>
}

interface OperationLane {
  readonly semaphore: ReturnType<typeof Semaphore.makeUnsafe>
  users: number
}

const sourcePermitCapacity = 1_000_000

export class ShelfOperationRuntimeClosedError extends Error {
  constructor() {
    super('Shelf operations are closed')
    this.name = 'ShelfOperationRuntimeClosedError'
  }
}

function withKeyedPermits<Result, Failure>(
  lanes: Map<string, OperationLane>,
  identity: string,
  identityName: string,
  laneCapacity: number,
  requestedPermits: number,
  operation: EffectType.Effect<Result, Failure>,
): EffectType.Effect<Result, Failure | TypeError> {
  if (identity.length === 0)
    return Effect.fail(new TypeError(`Shelf ${identityName} id must be non-empty`))

  return Effect.acquireUseRelease(
    Effect.sync(() => {
      let lane = lanes.get(identity)
      if (!lane) {
        lane = { semaphore: Semaphore.makeUnsafe(laneCapacity), users: 0 }
        lanes.set(identity, lane)
      }
      lane.users += 1
      return lane
    }),
    lane => lane.semaphore.withPermits(requestedPermits)(operation),
    lane => Effect.sync(() => releaseLane(lanes, identity, lane)),
  )
}

function releaseLane(
  lanes: Map<string, OperationLane>,
  identity: string,
  lane: OperationLane,
): void {
  lane.users -= 1
  if (lane.users === 0 && lanes.get(identity) === lane)
    lanes.delete(identity)
}

/**
 * Admits one complete Shelf request, then applies narrower resource permits
 * inside it. Source permits prevent refreshes and asset writes from racing a
 * source removal. Ordinary source uses share permits, while updates/removals
 * acquire the full source capacity. Reading permits serialize one local book.
 */
export function createShelfOperationRuntime(maximumConcurrentAssets: number): ShelfOperationRuntime {
  if (!Number.isInteger(maximumConcurrentAssets) || maximumConcurrentAssets < 1)
    throw new RangeError('Maximum asset concurrency must be a positive integer')

  const operations = createOperationSupervisor('Shelf operations', {
    closedError: () => new ShelfOperationRuntimeClosedError(),
    concurrency: 'unbounded',
  })
  const assetPermits = Semaphore.makeUnsafe(maximumConcurrentAssets)
  const readingLanes = new Map<string, OperationLane>()
  const sourceLanes = new Map<string, OperationLane>()

  const scope: ShelfOperationScope = {
    all: operations => Effect.gen(function* () {
      const results = yield* Effect.all(operations, {
        concurrency: 'unbounded',
        mode: 'result',
      })
      const failures = results
        .filter(Result.isFailure)
        .map(result => result.failure)
      if (failures.length > 0)
        return yield* Effect.fail(combineLifecycleFailures(failures, 'Shelf parallel operations failed'))
      return results
        .filter(Result.isSuccess)
        .map(result => result.success)
    }),
    asset: operation => assetPermits.withPermit(operation),
    reading: (readingId, operation) => withKeyedPermits(
      readingLanes,
      readingId,
      'reading',
      1,
      1,
      operation,
    ),
    source: (sourceId, operation) => withKeyedPermits(
      sourceLanes,
      sourceId,
      'source',
      sourcePermitCapacity,
      1,
      operation,
    ),
    sourceExclusive: (sourceId, operation) => withKeyedPermits(
      sourceLanes,
      sourceId,
      'source',
      sourcePermitCapacity,
      sourcePermitCapacity,
      operation,
    ),
  }

  return {
    close: operations.close,
    run: operation => operations.runEffect(Effect.suspend(() => operation(scope))),
  }
}
