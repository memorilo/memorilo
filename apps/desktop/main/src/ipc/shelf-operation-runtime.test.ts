import { deferred } from '@memorilo/effect-lifecycle/testing'
import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { createShelfOperationRuntime, ShelfOperationRuntimeClosedError } from './shelf-operation-runtime'

function waitFor(deferredValue: ReturnType<typeof deferred<void>>): Effect.Effect<void> {
  return Effect.promise(() => deferredValue.promise)
}

describe('shelf operation runtime', () => {
  it('bounds complete asset operations, including work after the fetch', async () => {
    const runtime = createShelfOperationRuntime(2)
    let active = 0
    let maximumActive = 0
    const releases: Array<() => void> = []
    const operations = Array.from({ length: 4 }, () => runtime.run(scope => scope.asset(Effect.gen(function* () {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      yield* Effect.promise<void>(() => new Promise(resolve => releases.push(resolve)))
      active -= 1
    }))))

    await vi.waitFor(() => expect(releases).toHaveLength(2))
    releases.splice(0).forEach(resolve => resolve())
    await vi.waitFor(() => expect(releases).toHaveLength(2))
    releases.splice(0).forEach(resolve => resolve())
    await Promise.all(operations)

    expect(maximumActive).toBe(2)
    await runtime.close()
  })

  it('serializes one reading while allowing unrelated readings to proceed', async () => {
    const runtime = createShelfOperationRuntime(1)
    const first = deferred<void>()
    const second = deferred<void>()
    const other = deferred<void>()
    const started: string[] = []

    const firstOperation = runtime.run(scope => scope.reading('reading-one', Effect.gen(function* () {
      started.push('first')
      yield* waitFor(first)
    })))
    const secondOperation = runtime.run(scope => scope.reading('reading-one', Effect.gen(function* () {
      started.push('second')
      yield* waitFor(second)
    })))
    const otherOperation = runtime.run(scope => scope.reading('reading-two', Effect.gen(function* () {
      started.push('other')
      yield* waitFor(other)
    })))

    await vi.waitFor(() => expect(started).toEqual(['first', 'other']))
    other.resolve()
    first.resolve()
    await firstOperation
    await vi.waitFor(() => expect(started).toEqual(['first', 'other', 'second']))
    second.resolve()
    await Promise.all([secondOperation, otherOperation])
    await runtime.close()
  })

  it('releases a reading permit and cleans its lane after failure', async () => {
    const runtime = createShelfOperationRuntime(1)
    await expect(runtime.run(scope => scope.reading('reading', Effect.fail(new Error('failed'))))).rejects.toThrow('failed')
    await expect(runtime.run(scope => scope.reading('reading', Effect.succeed('recovered')))).resolves.toBe('recovered')
    await runtime.close()
  })

  it('allows concurrent uses of one source', async () => {
    const runtime = createShelfOperationRuntime(1)
    const first = deferred<void>()
    const second = deferred<void>()
    const started: string[] = []

    const operations = [
      runtime.run(scope => scope.source('source-one', Effect.gen(function* () {
        started.push('first')
        yield* waitFor(first)
      }))),
      runtime.run(scope => scope.source('source-one', Effect.gen(function* () {
        started.push('second')
        yield* waitFor(second)
      }))),
    ]

    await vi.waitFor(() => expect(started).toEqual(['first', 'second']))
    first.resolve()
    second.resolve()
    await Promise.all(operations)
    await runtime.close()
  })

  it('settles every parallel branch before aggregating failures', async () => {
    const runtime = createShelfOperationRuntime(1)
    const releaseSecond = deferred<void>()
    const firstFailure = new Error('first source failed')
    const secondFailure = new Error('second source failed')
    let secondStarted = false

    const outcome = runtime.run(scope => scope.all([
      Effect.fail(firstFailure),
      Effect.gen(function* () {
        secondStarted = true
        yield* waitFor(releaseSecond)
        return yield* Effect.fail(secondFailure)
      }),
    ])).then(
      () => undefined,
      error => error as unknown,
    )
    await vi.waitFor(() => expect(secondStarted).toBe(true))
    let settled = false
    void outcome.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    releaseSecond.resolve()
    const error = await outcome
    expect(error).toBeInstanceOf(AggregateError)
    if (error instanceof AggregateError)
      expect(error.errors).toEqual([firstFailure, secondFailure])
    await runtime.close()
  })

  it('waits for source uses before an exclusive source operation', async () => {
    const runtime = createShelfOperationRuntime(1)
    const first = deferred<void>()
    const second = deferred<void>()
    const exclusive = deferred<void>()
    const started: string[] = []

    const firstUse = runtime.run(scope => scope.source('source', Effect.gen(function* () {
      started.push('first')
      yield* waitFor(first)
    })))
    const secondUse = runtime.run(scope => scope.source('source', Effect.gen(function* () {
      started.push('second')
      yield* waitFor(second)
    })))
    await vi.waitFor(() => expect(started).toEqual(['first', 'second']))

    const exclusiveUse = runtime.run(scope => scope.sourceExclusive('source', Effect.gen(function* () {
      started.push('exclusive')
      yield* waitFor(exclusive)
    })))
    await Promise.resolve()
    expect(started).toEqual(['first', 'second'])

    first.resolve()
    await firstUse
    await Promise.resolve()
    expect(started).toEqual(['first', 'second'])

    second.resolve()
    await secondUse
    await vi.waitFor(() => expect(started).toEqual(['first', 'second', 'exclusive']))
    exclusive.resolve()
    await exclusiveUse
    await runtime.close()
  })

  it('keeps nested scoped work admitted until it settles', async () => {
    const runtime = createShelfOperationRuntime(1)
    const pending = deferred<void>()
    const operation = runtime.run(scope => scope.source('source', waitFor(pending)))

    let settled = false
    void operation.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    pending.resolve()
    await operation
    expect(settled).toBe(true)
    await runtime.close()
  })

  it('stops admission and drains accepted queued operations during close', async () => {
    const runtime = createShelfOperationRuntime(1)
    const first = deferred<void>()
    const second = deferred<void>()
    const started: string[] = []
    const firstOperation = runtime.run(scope => scope.asset(Effect.gen(function* () {
      started.push('first')
      yield* waitFor(first)
    })))
    const secondOperation = runtime.run(scope => scope.asset(Effect.gen(function* () {
      started.push('second')
      yield* waitFor(second)
    })))
    await vi.waitFor(() => expect(started).toEqual(['first']))

    const firstClose = runtime.close()
    const secondClose = runtime.close()
    expect(secondClose).toBe(firstClose)
    await expect(runtime.run(() => Effect.void)).rejects.toBeInstanceOf(ShelfOperationRuntimeClosedError)

    first.resolve()
    await firstOperation
    await vi.waitFor(() => expect(started).toEqual(['first', 'second']))
    second.resolve()
    await Promise.all([secondOperation, firstClose])
  })

  it('drains ordinary accepted operations during close', async () => {
    const runtime = createShelfOperationRuntime(1)
    const pending = deferred<void>()
    const operation = runtime.run(() => waitFor(pending))

    const close = runtime.close()
    let closed = false
    void close.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)

    pending.resolve()
    await Promise.all([operation, close])
    expect(closed).toBe(true)
  })

  it('rejects invalid configuration and empty reading identities', async () => {
    expect(() => createShelfOperationRuntime(0)).toThrow(RangeError)
    const runtime = createShelfOperationRuntime(1)
    await expect(runtime.run(scope => scope.reading('', Effect.void))).rejects.toThrow(TypeError)
    await expect(runtime.run(scope => scope.source('', Effect.void))).rejects.toThrow(TypeError)
    await expect(runtime.run(scope => scope.sourceExclusive('', Effect.void))).rejects.toThrow(TypeError)
    await runtime.close()
  })
})
