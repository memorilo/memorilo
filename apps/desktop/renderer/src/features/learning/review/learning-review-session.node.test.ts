import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'
import { createLearningReviewSession } from './learning-review-session'

describe('learning review session', () => {
  it('commits only the latest route and preparation reads', async () => {
    const session = createLearningReviewSession()
    const firstRoute = deferred<string>()
    const secondRoute = deferred<string>()
    const first = session.route(() => firstRoute.promise)
    const second = session.route(() => secondRoute.promise)

    secondRoute.resolve('second')
    firstRoute.resolve('first')

    await expect(first).resolves.toEqual({ status: 'superseded' })
    await expect(second).resolves.toEqual({ status: 'current', value: 'second' })
    await session.close()
  })

  it('stops admission and drains accepted reads on close', async () => {
    const session = createLearningReviewSession()
    const pending = deferred<string>()
    const read = session.prepare(() => pending.promise)
    const closing = session.close()

    await expect(session.route(async () => 'late')).rejects.toThrow('Learning review session is not active')
    let closed = false
    void closing.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)

    pending.resolve('prepared')
    await expect(read).resolves.toEqual({ status: 'superseded' })
    await closing
    expect(closed).toBe(true)
  })

  it('rejects overlapping actions and suppresses a result completed during close', async () => {
    const session = createLearningReviewSession()
    const pending = deferred<string>()
    const operation = vi.fn(() => pending.promise)
    const action = session.action(operation)

    await expect(session.action(async () => 'overlap')).resolves.toEqual({ status: 'busy' })
    const closing = session.close()
    pending.resolve('committed')

    await expect(action).resolves.toEqual({ status: 'superseded' })
    await closing
    expect(operation).toHaveBeenCalledOnce()
  })

  it('suppresses an action failure observed after close starts', async () => {
    const session = createLearningReviewSession()
    const pending = deferred<string>()
    const action = session.action(() => pending.promise)
    const closing = session.close()

    pending.reject(new Error('stale rating failure'))

    await expect(action).resolves.toEqual({ status: 'superseded' })
    await closing
  })

  it('supersedes an accepted action when the route generation changes', async () => {
    const session = createLearningReviewSession()
    const pending = deferred<string>()
    const action = session.action(() => pending.promise)

    session.invalidateAction()
    pending.resolve('committed on the old route')

    await expect(action).resolves.toEqual({ status: 'superseded' })
    await session.close()
  })
})
