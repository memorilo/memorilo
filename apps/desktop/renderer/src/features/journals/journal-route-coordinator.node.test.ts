import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'

import { createJournalRouteCoordinator } from './journal-route-coordinator'

describe('journal route coordinator', () => {
  it('commits only the latest selection when an earlier open resolves late', async () => {
    const first = deferred<{ journalDate: string }>()
    const second = deferred<{ journalDate: string }>()
    const committed: string[] = []
    const coordinator = createJournalRouteCoordinator({
      flush: async () => undefined,
    })

    const firstSelection = coordinator.select({
      commit: note => committed.push(note.journalDate),
      load: () => first.promise,
    })
    const secondSelection = coordinator.select({
      commit: note => committed.push(note.journalDate),
      load: () => second.promise,
    })
    first.resolve({ journalDate: '2026-08-06' })

    await expect(firstSelection).resolves.toBe('superseded')
    expect(committed).toEqual([])
    second.resolve({ journalDate: '2026-08-05' })
    await expect(secondSelection).resolves.toBe('committed')
    expect(committed).toEqual(['2026-08-05'])
    await coordinator.close()
  })

  it('serializes refreshes and suppresses stale loads, preparation, and commits', async () => {
    const first = deferred<{ journalDate: string }>()
    const order: string[] = []
    const coordinator = createJournalRouteCoordinator({
      flush: async () => {
        order.push('flush')
      },
    })

    const firstRefresh = coordinator.refreshToday({
      commit: note => order.push(`commit ${note.journalDate}`),
      load: () => {
        order.push('load first')
        return first.promise
      },
      prepare: async () => {
        order.push('prepare first')
      },
    })
    await Promise.resolve()
    const secondRefresh = coordinator.refreshToday({
      commit: note => order.push(`commit ${note.journalDate}`),
      load: async () => {
        order.push('load second')
        return { journalDate: '2026-08-08' }
      },
    })
    first.resolve({ journalDate: '2026-08-07' })

    await expect(firstRefresh).resolves.toBe('superseded')
    await expect(secondRefresh).resolves.toBe('committed')
    expect(order).toEqual([
      'flush',
      'load first',
      'flush',
      'load second',
      'commit 2026-08-08',
    ])
    await coordinator.close()
  })

  it('invalidates refresh preparation on close before it can commit route state', async () => {
    const preparation = deferred<void>()
    const commit = vi.fn()
    let flushCount = 0
    const coordinator = createJournalRouteCoordinator({
      flush: async () => {
        flushCount += 1
      },
    })
    const refresh = coordinator.refreshToday({
      commit,
      load: async () => ({ journalDate: '2026-08-08' }),
      prepare: () => preparation.promise,
    })
    await Promise.resolve()
    await Promise.resolve()

    const close = coordinator.close()
    preparation.resolve()

    await expect(refresh).resolves.toBe('superseded')
    await expect(close).resolves.toBeUndefined()
    expect(commit).not.toHaveBeenCalled()
    expect(flushCount).toBe(2)
  })

  it('reports only current failures and suppresses errors from superseded work', async () => {
    const staleLoad = deferred<never>()
    const staleLoadStarted = deferred<void>()
    const staleFailure = vi.fn()
    const currentFailure = vi.fn()
    const failure = new Error('open failed')
    const coordinator = createJournalRouteCoordinator({
      flush: async () => undefined,
    })

    const stale = coordinator.refreshToday({
      commit: () => undefined,
      fail: staleFailure,
      load: () => {
        staleLoadStarted.resolve()
        return staleLoad.promise
      },
    })
    await staleLoadStarted.promise
    const current = coordinator.refreshToday({
      commit: () => undefined,
      fail: currentFailure,
      load: async () => { throw failure },
    })
    staleLoad.reject(new Error('stale failure'))

    await expect(stale).resolves.toBe('superseded')
    await expect(current).rejects.toBe(failure)
    expect(staleFailure).not.toHaveBeenCalled()
    expect(currentFailure).toHaveBeenCalledWith(failure)
    await coordinator.close()
  })

  it('shares concurrent close calls, retries a failed final flush, and rejects later work', async () => {
    const failure = new Error('disk full')
    let flushCount = 0
    const coordinator = createJournalRouteCoordinator({
      flush: () => {
        flushCount += 1
        return flushCount === 1 ? Promise.reject(failure) : Promise.resolve()
      },
    })

    const firstClose = coordinator.close()
    expect(coordinator.close()).toBe(firstClose)
    await expect(firstClose).rejects.toMatchObject({
      errors: [expect.objectContaining({
        cause: failure,
        message: 'Failed to close Journal final flush',
      })],
    })
    await expect(coordinator.close()).resolves.toBeUndefined()
    await expect(coordinator.select({
      commit: () => undefined,
      load: async () => ({ journalDate: '2026-08-06' }),
    })).rejects.toThrow('Journal route coordinator is closed')
  })

  it('drains an accepted route operation before the final flush', async () => {
    const loaded = deferred<{ journalDate: string }>()
    const loadStarted = deferred<void>()
    const flush = vi.fn(async () => undefined)
    const coordinator = createJournalRouteCoordinator({ flush })
    const selection = coordinator.select({
      commit: () => undefined,
      load: async () => {
        loadStarted.resolve()
        return loaded.promise
      },
    })

    await loadStarted.promise
    const closing = coordinator.close()
    await Promise.resolve()
    expect(flush).toHaveBeenCalledOnce()

    loaded.resolve({ journalDate: '2026-08-12' })
    await expect(selection).resolves.toBe('superseded')
    await closing
    expect(flush).toHaveBeenCalledTimes(2)
  })
})
