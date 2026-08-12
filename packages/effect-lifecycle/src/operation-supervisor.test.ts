import { Effect } from 'effect'
import { describe, expect, it, vi } from 'vitest'
import { createOperationSupervisor } from './operation-supervisor'

describe('operation supervisor', () => {
  it('serializes operations, releases failed permits, and drains queued work', async () => {
    const supervisor = createOperationSupervisor('test supervisor')
    const order: string[] = []
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = supervisor.run(async () => {
      order.push('first:start')
      await blocked
      order.push('first:end')
    })
    const second = supervisor.run(async () => {
      order.push('second')
      throw new Error('failed')
    })
    const third = supervisor.run(async () => {
      order.push('third')
    })
    const close = supervisor.close()

    await expect(supervisor.run(async () => undefined)).rejects.toThrow('test supervisor is closed')
    release()
    await first
    await expect(second).rejects.toThrow('failed')
    await third
    await close
    expect(order).toEqual(['first:start', 'first:end', 'second', 'third'])
  })

  it('shares close calls', () => {
    const supervisor = createOperationSupervisor('test supervisor')
    expect(supervisor.isClosed()).toBe(false)
    expect(supervisor.close()).toBe(supervisor.close())
    expect(supervisor.isClosed()).toBe(true)
  })

  it('runs unbounded operations concurrently and drains accepted work', async () => {
    const supervisor = createOperationSupervisor('test admission', {
      concurrency: 'unbounded',
    })
    const releases: Array<() => void> = []
    const operations = Array.from({ length: 2 }, () => supervisor.run(async () => {
      await new Promise<void>(resolve => releases.push(resolve))
    }))

    await vi.waitFor(() => expect(releases).toHaveLength(2))
    const close = supervisor.close()
    await expect(supervisor.run(async () => undefined)).rejects.toThrow('test admission is closed')

    let closed = false
    void close.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    releases.forEach(release => release())
    await Promise.all([...operations, close])
    expect(closed).toBe(true)
  })

  it('captures synchronous failures and drains failed unbounded operations', async () => {
    const supervisor = createOperationSupervisor('test admission', {
      concurrency: 'unbounded',
    })
    let started = false
    const failed = supervisor.run(() => {
      started = true
      throw new Error('request failed')
    })
    expect(started).toBe(true)
    const close = supervisor.close()

    await expect(failed).rejects.toThrow('request failed')
    await expect(close).resolves.toBeUndefined()
  })

  it('owns native Effects and releases their serial permit after failure', async () => {
    const supervisor = createOperationSupervisor('effect supervisor')
    await expect(supervisor.runEffect(Effect.fail(new Error('effect failed')))).rejects.toThrow('effect failed')
    await expect(supervisor.runEffect(Effect.succeed('retried'))).resolves.toBe('retried')
    await supervisor.close()
  })

  it('interrupts accepted native Effects during interrupt shutdown', async () => {
    const supervisor = createOperationSupervisor('effect shutdown', { shutdown: 'interrupt' })
    let interrupted = false
    const operation = supervisor.runEffect(
      Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => {
        interrupted = true
      }))),
    )

    await vi.waitFor(() => expect(interrupted).toBe(false))
    await expect(supervisor.close()).resolves.toBeUndefined()
    await expect(operation).rejects.toThrow()
    expect(interrupted).toBe(true)
  })

  it('interrupts cooperative work and prevents queued work from starting', async () => {
    const supervisor = createOperationSupervisor('PDF mount', { shutdown: 'interrupt' })
    const started = vi.fn()
    const first = supervisor.run(async (signal) => {
      started('first')
      return new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })
    const second = supervisor.run(async (signal) => {
      started('second')
      signal.throwIfAborted()
    })

    await vi.waitFor(() => expect(started).toHaveBeenCalledWith('first'))
    const close = supervisor.close()

    await expect(first).rejects.toThrow('PDF mount interrupted')
    await expect(second).rejects.toThrow('PDF mount interrupted')
    await expect(close).resolves.toBeUndefined()
    expect(started).toHaveBeenCalledOnce()
  })

  it('drains interruptible operations that ignore cooperative cancellation', async () => {
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const supervisor = createOperationSupervisor('remote read', {
      concurrency: 'unbounded',
      shutdown: 'interrupt',
    })
    const operation = supervisor.run(async () => blocked)
    const close = supervisor.close()

    let closed = false
    void close.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)

    release()
    await Promise.all([operation, close])
  })

  it('rejects overlapping single-flight admission and releases it after failure', async () => {
    const supervisor = createOperationSupervisor('review action')
    let release!: () => void
    const pending = new Promise<string>((resolve) => {
      release = () => resolve('first')
    })
    const first = supervisor.runSingleFlight(async () => pending)

    await expect(supervisor.runSingleFlight(async () => 'second')).resolves.toEqual({ status: 'busy' })
    release()
    await expect(first).resolves.toEqual({ status: 'accepted', value: 'first' })

    await expect(supervisor.runSingleFlight(async () => {
      throw new Error('rating conflict')
    })).rejects.toThrow('rating conflict')
    await expect(supervisor.runSingleFlight(async () => 'retried')).resolves.toEqual({
      status: 'accepted',
      value: 'retried',
    })
  })

  it('drains accepted single-flight work before close resolves', async () => {
    const supervisor = createOperationSupervisor('review action')
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const operation = supervisor.runSingleFlight(async () => pending)
    const close = supervisor.close()

    await expect(supervisor.runSingleFlight(async () => undefined)).rejects.toThrow('review action is closed')
    release()
    await Promise.all([operation, close])
  })
})
