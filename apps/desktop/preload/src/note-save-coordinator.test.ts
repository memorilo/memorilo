import type { NoteSaveResult } from './note-save-handshake'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'
import { createNoteSaveCoordinator } from './note-save-coordinator'

describe('note save coordinator', () => {
  it('serializes overlapping requests and preserves response correlation', async () => {
    const firstFlush = deferred()
    const results: NoteSaveResult[] = []
    const events: string[] = []
    let flushCount = 0
    const coordinator = createNoteSaveCoordinator(result => results.push(result))
    coordinator.subscribe(async () => {
      flushCount += 1
      events.push(`flush-${flushCount}-start`)
      if (flushCount === 1)
        await firstFlush.promise
      events.push(`flush-${flushCount}-end`)
    })

    const first = coordinator.handle('request-1')
    const second = coordinator.handle('request-2')
    await Promise.resolve()

    expect(events).toEqual(['flush-1-start'])
    expect(results).toEqual([])

    firstFlush.resolve()
    await Promise.all([first, second])

    expect(events).toEqual([
      'flush-1-start',
      'flush-1-end',
      'flush-2-start',
      'flush-2-end',
    ])
    expect(results).toEqual([
      { requestId: 'request-1', status: 'saved' },
      { requestId: 'request-2', status: 'saved' },
    ])
  })

  it('waits for every listener to settle before reporting a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const remainingFlush = deferred()
    const results: NoteSaveResult[] = []
    const coordinator = createNoteSaveCoordinator(result => results.push(result))
    coordinator.subscribe(() => {
      throw new Error('disk full')
    })
    coordinator.subscribe(() => remainingFlush.promise)

    const operation = coordinator.handle('request-failed')
    await Promise.resolve()
    await Promise.resolve()
    expect(results).toEqual([])

    remainingFlush.resolve()
    await operation

    expect(results).toEqual([{
      message: 'disk full',
      requestId: 'request-failed',
      status: 'failed',
    }])
  })

  it('continues accepting requests after a listener failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const results: NoteSaveResult[] = []
    const coordinator = createNoteSaveCoordinator(result => results.push(result))
    let shouldFail = true
    coordinator.subscribe(() => {
      if (shouldFail) {
        shouldFail = false
        throw new Error('temporary failure')
      }
    })

    await coordinator.handle('request-failed')
    await coordinator.handle('request-retried')

    expect(results).toEqual([
      {
        message: 'temporary failure',
        requestId: 'request-failed',
        status: 'failed',
      },
      { requestId: 'request-retried', status: 'saved' },
    ])
  })

  it('drains accepted saves, rejects later admission, and closes subscriptions', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const flush = deferred()
    const started = deferred()
    const results: NoteSaveResult[] = []
    const coordinator = createNoteSaveCoordinator(result => results.push(result))
    coordinator.subscribe(async () => {
      started.resolve()
      await flush.promise
    })

    const accepted = coordinator.handle('request-accepted')
    await started.promise
    const closing = coordinator.close()
    await coordinator.handle('request-closed')

    expect(results).toEqual([{
      message: 'Renderer Note save coordinator is closed',
      requestId: 'request-closed',
      status: 'failed',
    }])
    expect(() => coordinator.subscribe(() => undefined)).toThrow(
      'Renderer Note save coordinator is closed',
    )

    flush.resolve()
    await Promise.all([accepted, closing])
    expect(results.at(-1)).toEqual({ requestId: 'request-accepted', status: 'saved' })
  })
})
