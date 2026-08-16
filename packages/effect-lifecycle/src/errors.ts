export function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}

/**
 * Shares an in-flight close attempt and clears it after failure so shutdown
 * callers can retry failed finalizers. The rejection is observed immediately
 * for fire-and-forget cleanup paths without changing the returned promise.
 */
export function createRetryableClose(): (attempt: () => Promise<void>) => Promise<void> {
  let current: Promise<void> | undefined
  return (attempt) => {
    if (current)
      return current
    let started: Promise<void>
    try {
      started = Promise.resolve(attempt())
    }
    catch (error) {
      started = Promise.reject(toError(error))
    }
    const observed = started.then(
      () => undefined,
      (error) => {
        if (current === observed)
          current = undefined
        throw toError(error)
      },
    )
    current = observed
    void observed.then(undefined, () => undefined)
    return observed
  }
}

function flattenLifecycleFailures(cause: unknown): readonly Error[] {
  if (cause instanceof AggregateError)
    return cause.errors.flatMap(flattenLifecycleFailures)
  return [toError(cause)]
}

/**
 * Preserve a single failure for useful identity and aggregate only when
 * multiple independent cleanup failures need to be reported together.
 */
export function combineLifecycleFailures(
  failures: readonly unknown[],
  message: string,
  options: { readonly alwaysAggregate?: boolean } = {},
): Error {
  const normalized = failures.flatMap(flattenLifecycleFailures)
  if (normalized.length === 1 && options.alwaysAggregate !== true)
    return normalized[0]!
  return new AggregateError(normalized, message)
}

// Lifecycle results are intentionally ignored. Accepting unknown values lets
// callers pass native close APIs that return Promise<unknown> without adapter
// lambdas whose only purpose is to discard a result.
export type LifecycleOperation = () => Promise<unknown> | unknown
export type SyncLifecycleOperation = () => unknown

/**
 * Runs every synchronous lifecycle operation in declaration order and reports
 * all failures after the run. Callers keep retry ownership by mutating their
 * released state only after each operation succeeds.
 */
export function runSyncLifecycleOperations(
  operations: readonly SyncLifecycleOperation[],
  message: string,
): void {
  const failures: unknown[] = []
  for (const operation of operations) {
    try {
      operation()
    }
    catch (error) {
      failures.push(error)
    }
  }
  if (failures.length > 0)
    throw combineLifecycleFailures(failures, message)
}

/**
 * Runs every lifecycle operation and reports all failures after the run.
 * Sequential mode preserves dependency order while still attempting later
 * cleanup; parallel mode starts every operation immediately.
 */
export async function runLifecycleOperations(
  operations: readonly LifecycleOperation[],
  message: string,
  order: 'parallel' | 'sequential' = 'parallel',
): Promise<void> {
  const failures: unknown[] = []
  if (order === 'sequential') {
    for (const operation of operations) {
      try {
        await operation()
      }
      catch (error) {
        failures.push(error)
      }
    }
  }
  else {
    const results = await Promise.allSettled(
      operations.map((operation) => {
        try {
          return Promise.resolve(operation())
        }
        catch (error) {
          return Promise.reject(error)
        }
      }),
    )
    for (const result of results) {
      if (result.status === 'rejected')
        failures.push(result.reason)
    }
  }
  if (failures.length > 0)
    throw combineLifecycleFailures(failures, message)
}
