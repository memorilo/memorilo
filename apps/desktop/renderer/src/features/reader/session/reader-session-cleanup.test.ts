import { describe, expect, it, vi } from 'vitest'
import { cleanupReaderSession } from './reader-session-cleanup'

describe('reader session cleanup', () => {
  it('closes the native session even when the final persistence flush fails', async () => {
    const flush = vi.fn().mockRejectedValue(new Error('disk full'))
    const close = vi.fn().mockResolvedValue(undefined)

    await expect(cleanupReaderSession({ close, flush })).rejects.toThrow('Failed to flush reader Note persistence')
    expect(flush).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('aggregates independent flush and close failures', async () => {
    const flush = vi.fn().mockRejectedValue(new Error('disk full'))
    const close = vi.fn().mockRejectedValue(new Error('session busy'))

    const error = await cleanupReaderSession({ close, flush }).catch(cause => cause)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toHaveLength(2)
  })

  it('completes when both phases succeed', async () => {
    await expect(cleanupReaderSession({
      close: vi.fn().mockResolvedValue(undefined),
      flush: vi.fn().mockResolvedValue(undefined),
    })).resolves.toBeUndefined()
  })
})
