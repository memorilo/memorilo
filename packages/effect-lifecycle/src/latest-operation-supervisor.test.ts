import { describe, expect, it, vi } from 'vitest'
import { createLatestOperationSupervisor } from './latest-operation-supervisor'
import { deferred } from './testing'

describe('latest operation supervisor', () => {
  it('interrupts replaced work in the same channel', async () => {
    const supervisor = createLatestOperationSupervisor<'load'>('latest load')
    const aborted = deferred<void>()
    const started = deferred<void>()

    const firstResult = supervisor.run('load', ({ signal }) => new Promise((_resolve, reject) => {
      started.resolve()
      signal.addEventListener('abort', () => {
        aborted.resolve()
        reject(signal.reason)
      }, { once: true })
    }))
    await started.promise
    const secondResult = supervisor.run('load', async () => 'new')

    await aborted.promise
    await expect(firstResult).resolves.toEqual({ status: 'superseded' })
    await expect(secondResult).resolves.toEqual({ status: 'current', value: 'new' })
    await supervisor.close()
  })

  it('keeps separate channels independent', async () => {
    const supervisor = createLatestOperationSupervisor<'left' | 'right'>('latest load', {
      concurrency: 'parallel',
    })
    const left = deferred<string>()
    const right = deferred<string>()
    const leftStarted = deferred<void>()
    const rightStarted = deferred<void>()
    let rightSignal: AbortSignal | undefined

    const firstLeft = supervisor.run('left', () => {
      leftStarted.resolve()
      return left.promise
    })
    const rightResult = supervisor.run('right', ({ signal }) => {
      rightStarted.resolve()
      rightSignal = signal
      return right.promise
    })
    await Promise.all([leftStarted.promise, rightStarted.promise])
    const secondLeft = supervisor.run('left', async () => 'new-left')
    left.resolve('old-left')
    right.resolve('right')

    await expect(firstLeft).resolves.toEqual({ status: 'superseded' })
    await expect(secondLeft).resolves.toEqual({ status: 'current', value: 'new-left' })
    await expect(rightResult).resolves.toEqual({ status: 'current', value: 'right' })
    expect(rightSignal?.aborted).toBe(false)
    await supervisor.close()
  })

  it('runs unrelated channels concurrently when configured', async () => {
    const supervisor = createLatestOperationSupervisor<'left' | 'right'>('latest load', {
      concurrency: 'parallel',
    })
    const left = deferred<void>()
    const leftStarted = deferred<void>()
    const rightStarted = deferred<void>()

    const leftResult = supervisor.run('left', async () => {
      leftStarted.resolve()
      await left.promise
      return 'left'
    })
    await leftStarted.promise

    const rightResult = supervisor.run('right', async () => {
      rightStarted.resolve()
      return 'right'
    })
    await rightStarted.promise
    await expect(rightResult).resolves.toEqual({ status: 'current', value: 'right' })

    left.resolve()
    await expect(leftResult).resolves.toEqual({ status: 'current', value: 'left' })
    await supervisor.close()
  })

  it('reclaims a late value from work that ignores cancellation', async () => {
    const supervisor = createLatestOperationSupervisor<'load'>('latest load')
    const first = deferred<string>()
    const started = deferred<void>()
    const reclaimed = vi.fn()
    const checkpoints: boolean[] = []

    const firstResult = supervisor.run('load', async ({ isCurrent, signal }) => {
      started.resolve()
      checkpoints.push(isCurrent())
      const value = await first.promise
      checkpoints.push(isCurrent())
      expect(signal.aborted).toBe(true)
      return value
    }, { onSuperseded: reclaimed })
    await started.promise
    const secondResult = supervisor.run('load', async () => 'new')
    first.resolve('old')

    await expect(firstResult).resolves.toEqual({ status: 'superseded' })
    await expect(secondResult).resolves.toEqual({ status: 'current', value: 'new' })
    expect(checkpoints).toEqual([true, false])
    expect(reclaimed).toHaveBeenCalledWith('old')
    await supervisor.close()
  })

  it('propagates a stale-value cleanup failure', async () => {
    const supervisor = createLatestOperationSupervisor<'load'>('latest load')
    const stale = deferred<string>()
    const started = deferred<void>()
    const cleanupFailure = new Error('close stale resource failed')

    const staleResult = supervisor.run('load', () => {
      started.resolve()
      return stale.promise
    }, {
      onSuperseded: async () => {
        throw cleanupFailure
      },
    })
    await started.promise
    const currentResult = supervisor.run('load', async () => 'new')
    stale.resolve('old')

    await expect(staleResult).rejects.toBe(cleanupFailure)
    await expect(currentResult).resolves.toEqual({ status: 'current', value: 'new' })
    await supervisor.close()
  })

  it('suppresses superseded failures but propagates the current failure', async () => {
    const supervisor = createLatestOperationSupervisor<'load'>('latest load')
    const stale = deferred<never>()
    const staleStarted = deferred<void>()
    const currentFailure = new Error('current failure')

    const staleResult = supervisor.run('load', () => {
      staleStarted.resolve()
      return stale.promise
    })
    await staleStarted.promise
    const currentResult = supervisor.run('load', async () => {
      throw currentFailure
    })
    stale.reject(new Error('obsolete failure'))

    await expect(staleResult).resolves.toEqual({ status: 'superseded' })
    await expect(currentResult).rejects.toBe(currentFailure)
    await supervisor.close()
  })

  it('invalidates and drains accepted work before rejecting later admission', async () => {
    const supervisor = createLatestOperationSupervisor<'load'>('latest load')
    const pending = deferred<string>()
    let signal: AbortSignal | undefined
    const result = supervisor.run('load', (context) => {
      signal = context.signal
      return pending.promise
    })
    const closing = supervisor.close()

    await expect(supervisor.run('load', async () => 'late')).rejects.toThrow('latest load is closed')
    expect(signal?.aborted).toBe(false)
    pending.resolve('obsolete')
    await expect(result).resolves.toEqual({ status: 'superseded' })
    await expect(closing).resolves.toBeUndefined()
    expect(supervisor.close()).toBe(closing)
  })

  it('interrupts accepted work during interrupt shutdown', async () => {
    const supervisor = createLatestOperationSupervisor<'load'>('latest load', {
      shutdown: 'interrupt',
    })
    const aborted = deferred<void>()
    const result = supervisor.run('load', ({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted.resolve()
        reject(signal.reason)
      }, { once: true })
    }))

    const closing = supervisor.close()
    await aborted.promise
    await expect(result).resolves.toEqual({ status: 'superseded' })
    await expect(closing).resolves.toBeUndefined()
  })
})
