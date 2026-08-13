import { beforeEach, describe, expect, it, vi } from 'vitest'

const handle = vi.fn(async () => undefined)
const unhandle = vi.fn()
vi.mock('electron', () => ({ protocol: { handle, unhandle } }))

const { registerProtocol } = await import('./protocol-registration')

beforeEach(() => {
  handle.mockClear()
  unhandle.mockClear()
})

describe('protocol registration ownership', () => {
  it('unregisters exactly once after a successful close', async () => {
    const handler = vi.fn(async () => new Response('ok'))
    const registration = await registerProtocol('memorilo-test', handler)

    registration.close()
    registration.close()

    expect(handle).toHaveBeenCalledWith('memorilo-test', handler)
    expect(unhandle).toHaveBeenCalledOnce()
  })

  it('retains ownership when unregistration fails so shutdown can retry', async () => {
    const failure = new Error('protocol is still in use')
    unhandle.mockImplementationOnce(() => {
      throw failure
    })
    const registration = await registerProtocol('memorilo-retry', vi.fn(async () => new Response('ok')))

    expect(() => registration.close()).toThrow(failure)
    expect(() => registration.close()).not.toThrow()
    expect(unhandle).toHaveBeenCalledTimes(2)
  })
})
