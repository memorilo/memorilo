import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'
import { createReaderSessionOwner } from './reader-session-owner'

function createOwner(overrides: Partial<Parameters<typeof createReaderSessionOwner>[0]> = {}) {
  const closeSession = vi.fn().mockResolvedValue(undefined)
  const flush = vi.fn().mockResolvedValue(undefined)
  const onCleanupError = vi.fn()
  return {
    closeSession,
    flush,
    onCleanupError,
    owner: createReaderSessionOwner({ closeSession, flush, onCleanupError, ...overrides }),
  }
}

describe('reader session owner', () => {
  it('accepts only the latest request and closes a session returned by a stale request', async () => {
    const first = deferred<{ sessionId: string, value: string }>()
    const second = deferred<{ sessionId: string, value: string }>()
    const { closeSession, owner } = createOwner()

    const firstAcquisition = owner.acquire(() => first.promise)
    const secondAcquisition = owner.acquire(() => second.promise)
    first.resolve({ sessionId: 'session-1', value: 'old' })

    await expect(firstAcquisition).resolves.toEqual({ status: 'superseded' })
    expect(closeSession).toHaveBeenCalledWith('session-1')
    second.resolve({ sessionId: 'session-2', value: 'new' })
    await expect(secondAcquisition).resolves.toEqual({
      status: 'current',
      value: { sessionId: 'session-2', value: 'new' },
    })
    await owner.close()
  })

  it('serializes session acquisitions so a newer request waits for the prior IPC call', async () => {
    const first = deferred<{ sessionId: string, value: string }>()
    const second = deferred<{ sessionId: string, value: string }>()
    const { owner } = createOwner()
    const firstOperation = vi.fn(() => first.promise)
    const secondOperation = vi.fn(() => second.promise)

    const firstAcquisition = owner.acquire(firstOperation)
    const secondAcquisition = owner.acquire(secondOperation)

    await Promise.resolve()
    expect(firstOperation).toHaveBeenCalledOnce()
    expect(secondOperation).not.toHaveBeenCalled()

    first.resolve({ sessionId: 'session-1', value: 'old' })
    await expect(firstAcquisition).resolves.toEqual({ status: 'superseded' })
    await vi.waitFor(() => expect(secondOperation).toHaveBeenCalledOnce())

    second.resolve({ sessionId: 'session-2', value: 'new' })
    await expect(secondAcquisition).resolves.toEqual({
      status: 'current',
      value: { sessionId: 'session-2', value: 'new' },
    })
    await owner.close()
  })

  it('drains an in-flight request during close and reclaims its late session', async () => {
    const pending = deferred<{ sessionId: string }>()
    const { closeSession, owner } = createOwner()
    const acquisition = owner.acquire(() => pending.promise)

    const closing = owner.close()
    pending.resolve({ sessionId: 'late-session' })

    await expect(closing).resolves.toBeUndefined()
    await expect(acquisition).resolves.toEqual({ status: 'superseded' })
    expect(closeSession).toHaveBeenCalledWith('late-session')
    await expect(owner.acquire(async () => ({ sessionId: 'never' }))).rejects.toThrow('closed')
  })

  it('attempts both final flush and close, then permits cleanup retry after failure', async () => {
    const flush = vi.fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined)
    const { closeSession, owner } = createOwner({ flush })
    await owner.acquire(async () => ({ sessionId: 'active-session' }))

    const firstClose = owner.close()
    expect(owner.close()).toBe(firstClose)
    await expect(firstClose).rejects.toMatchObject({
      cause: expect.objectContaining({
        cause: expect.objectContaining({ message: 'disk full' }),
        message: 'Failed to flush reader Note persistence',
      }),
      message: 'Failed to close owned reader sessions',
    })
    expect(closeSession).toHaveBeenCalledTimes(1)

    await expect(owner.close()).resolves.toBeUndefined()
    expect(flush).toHaveBeenCalledTimes(2)
    expect(closeSession).toHaveBeenCalledTimes(2)
  })

  it('flushes and retires the previous active session when a replacement is accepted', async () => {
    const { closeSession, flush, owner } = createOwner()
    await owner.acquire(async () => ({ sessionId: 'session-1' }))
    await owner.acquire(async () => ({ sessionId: 'session-2' }))

    await vi.waitFor(() => expect(closeSession).toHaveBeenCalledWith('session-1'))
    expect(flush).toHaveBeenCalledOnce()
    await owner.close()
    expect(closeSession).toHaveBeenCalledWith('session-2')
  })

  it('flushes the active Note before starting a replacement acquisition', async () => {
    const persisted = deferred()
    const flush = vi.fn()
      .mockImplementationOnce(() => persisted.promise)
      .mockResolvedValue(undefined)
    const { owner } = createOwner({ flush })
    await owner.acquire(async () => ({ sessionId: 'session-1' }))
    const replacementOperation = vi.fn(async () => ({ sessionId: 'session-2' }))

    const replacement = owner.acquire(replacementOperation)
    await vi.waitFor(() => expect(flush).toHaveBeenCalledOnce())

    expect(replacementOperation).not.toHaveBeenCalled()
    persisted.resolve()
    await expect(replacement).resolves.toEqual({
      status: 'current',
      value: { sessionId: 'session-2' },
    })
    expect(replacementOperation).toHaveBeenCalledOnce()
    await owner.close()
  })

  it('keeps the active session owned when a replacement pre-flush fails and permits retry', async () => {
    const failure = new Error('disk full')
    const flush = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined)
    const { closeSession, owner } = createOwner({ flush })
    await owner.acquire(async () => ({ sessionId: 'session-1' }))
    const failedOperation = vi.fn(async () => ({ sessionId: 'never' }))

    await expect(owner.acquire(failedOperation)).rejects.toBe(failure)
    expect(failedOperation).not.toHaveBeenCalled()
    expect(closeSession).not.toHaveBeenCalled()

    await expect(owner.acquire(async () => ({ sessionId: 'session-2' }))).resolves.toEqual({
      status: 'current',
      value: { sessionId: 'session-2' },
    })
    await vi.waitFor(() => expect(closeSession).toHaveBeenCalledWith('session-1'))
    await owner.close()
  })

  it('does not start a replacement after close begins while its pre-flush is pending', async () => {
    const persisted = deferred()
    const flush = vi.fn()
      .mockImplementationOnce(() => persisted.promise)
      .mockResolvedValue(undefined)
    const { closeSession, owner } = createOwner({ flush })
    await owner.acquire(async () => ({ sessionId: 'session-1' }))
    const replacementOperation = vi.fn(async () => ({ sessionId: 'session-2' }))

    const replacement = owner.acquire(replacementOperation)
    await vi.waitFor(() => expect(flush).toHaveBeenCalledOnce())
    const closing = owner.close()
    persisted.resolve()

    await expect(replacement).resolves.toEqual({ status: 'superseded' })
    await expect(closing).resolves.toBeUndefined()
    expect(replacementOperation).not.toHaveBeenCalled()
    expect(closeSession).toHaveBeenCalledOnce()
    expect(closeSession).toHaveBeenCalledWith('session-1')
  })

  it('does not reclaim the active session when a stale response reuses its id', async () => {
    const stale = deferred<{ sessionId: string }>()
    const current = deferred<{ sessionId: string }>()
    const { closeSession, owner } = createOwner()

    await expect(owner.acquire(async () => ({ sessionId: 'active-session' }))).resolves.toEqual({
      status: 'current',
      value: { sessionId: 'active-session' },
    })
    const staleAcquisition = owner.acquire(() => stale.promise)
    const currentAcquisition = owner.acquire(() => current.promise)

    stale.resolve({ sessionId: 'active-session' })
    await expect(staleAcquisition).resolves.toEqual({ status: 'superseded' })
    expect(closeSession).not.toHaveBeenCalled()

    current.resolve({ sessionId: 'active-session' })
    await expect(currentAcquisition).resolves.toEqual({
      status: 'current',
      value: { sessionId: 'active-session' },
    })
    await owner.close()
    expect(closeSession).toHaveBeenCalledOnce()
    expect(closeSession).toHaveBeenCalledWith('active-session')
  })

  it('drains acquisitions before closing existing sessions', async () => {
    const replacement = deferred<{ sessionId: string }>()
    const started = deferred<void>()
    const { closeSession, owner } = createOwner()
    await owner.acquire(async () => ({ sessionId: 'active-session' }))

    const pending = owner.acquire(() => {
      started.resolve()
      return replacement.promise
    })
    await started.promise
    const closing = owner.close()
    replacement.resolve({ sessionId: 'replacement-session' })

    await expect(pending).resolves.toEqual({ status: 'superseded' })
    await closing
    expect(closeSession.mock.calls.map(([sessionId]) => sessionId)).toEqual([
      'replacement-session',
      'active-session',
    ])
  })
})
