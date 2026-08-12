import { describe, expect, it } from 'vitest'
import {
  combineLifecycleFailures,
  createRetryableClose,
  runLifecycleOperations,
  runSyncLifecycleOperations,
} from './errors'

describe('combine lifecycle failures', () => {
  it('preserves the original error when there is one failure', () => {
    const failure = new Error('close failed')

    expect(combineLifecycleFailures([failure], 'cleanup failed')).toBe(failure)
  })

  it('flattens nested aggregates while preserving failure order', () => {
    const first = new Error('first')
    const nested = new AggregateError([new Error('second'), new Error('third')], 'nested')

    const combined = combineLifecycleFailures([first, nested], 'cleanup failed')

    expect(combined).toBeInstanceOf(AggregateError)
    expect((combined as AggregateError).message).toBe('cleanup failed')
    expect((combined as AggregateError).errors.map(error => (error as Error).message)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  it('normalizes non-Error causes for a stable cleanup contract', () => {
    const combined = combineLifecycleFailures(['failed'], 'cleanup failed')

    expect(combined).toEqual(new Error('failed'))
  })

  it('can force an aggregate for a single independent cleanup failure', () => {
    const failure = new Error('close failed')

    const combined = combineLifecycleFailures([failure], 'cleanup failed', { alwaysAggregate: true })

    expect(combined).toBeInstanceOf(AggregateError)
    expect((combined as AggregateError).errors).toEqual([failure])
  })
})

describe('retryable close', () => {
  it('shares an in-flight attempt, observes failures, and retries after failure', async () => {
    const retryableClose = createRetryableClose()
    const firstFailure = new Error('first close failed')
    let attempts = 0
    const first = retryableClose(async () => {
      attempts += 1
      throw firstFailure
    })
    expect(retryableClose(async () => {
      attempts += 1
    })).toBe(first)
    await expect(first).rejects.toBe(firstFailure)
    await expect(retryableClose(async () => {
      attempts += 1
    })).resolves.toBeUndefined()
    expect(attempts).toBe(2)
  })
})

describe('run lifecycle operations', () => {
  it('runs every parallel operation and aggregates its failures', async () => {
    const calls: string[] = []
    const first = new Error('first')
    const second = new Error('second')

    await expect(runLifecycleOperations([
      async () => {
        calls.push('first')
        throw first
      },
      () => {
        calls.push('second')
        throw second
      },
      () => {
        calls.push('success')
      },
    ], 'cleanup failed')).rejects.toMatchObject({
      errors: [first, second],
      message: 'cleanup failed',
    })
    expect(calls).toEqual(['first', 'second', 'success'])
  })

  it('starts parallel operations synchronously before awaiting their results', async () => {
    const calls: string[] = []

    const running = runLifecycleOperations([
      async () => {
        calls.push('started')
      },
    ], 'cleanup failed')

    expect(calls).toEqual(['started'])
    await running
  })

  it('keeps sequential dependency order while continuing after a failure', async () => {
    const calls: string[] = []

    await expect(runLifecycleOperations([
      () => {
        calls.push('first')
        throw new Error('first')
      },
      async () => {
        calls.push('second')
      },
    ], 'cleanup failed', 'sequential')).rejects.toThrow('first')
    expect(calls).toEqual(['first', 'second'])
  })
})

describe('run synchronous lifecycle operations', () => {
  it('attempts every operation and preserves failure order', () => {
    const calls: string[] = []
    const first = new Error('first')
    const second = new Error('second')

    const error = (() => {
      try {
        runSyncLifecycleOperations([
          () => {
            calls.push('first')
            throw first
          },
          () => {
            calls.push('success')
          },
          () => {
            calls.push('second')
            throw second
          },
        ], 'cleanup failed')
      }
      catch (cause) {
        return cause
      }
      return undefined
    })()

    expect(error).toMatchObject({
      errors: [first, second],
      message: 'cleanup failed',
    })
    expect(calls).toEqual(['first', 'success', 'second'])
  })

  it('preserves one failure for retry-sensitive identity checks', () => {
    const failure = new Error('close failed')

    let error: unknown
    try {
      runSyncLifecycleOperations([
        () => { throw failure },
      ], 'cleanup failed')
    }
    catch (cause) {
      error = cause
    }
    expect(error).toBe(failure)
  })
})
