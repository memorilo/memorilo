import { describe, expect, it, vi } from 'vitest'

import { createResourceScope } from './resource-scope'
import { deferred } from './testing'

describe('resource scope', () => {
  it('retains acquired resources after commit and closes them in reverse order', async () => {
    const order: string[] = []
    const scope = createResourceScope('Application')
    await scope.acquire({
      acquire: () => 'database',
      close: async () => { order.push('database') },
      name: 'database',
    })
    await scope.acquire({
      acquire: () => 'storage',
      close: async () => { order.push('storage') },
      name: 'storage',
    })

    scope.commit()
    expect(scope.isClosed()).toBe(false)
    await scope.close()
    expect(scope.isClosed()).toBe(true)

    expect(order).toEqual(['storage', 'database'])
  })

  it('rolls back active resources, honors transfer, and preserves startup and cleanup failures', async () => {
    const scope = createResourceScope('Application')
    const databaseClose = vi.fn(async () => undefined)
    const database = await scope.acquire({
      acquire: () => 'database',
      close: databaseClose,
      name: 'database',
    })
    database.transfer()
    const closeFailure = new Error('storage close failed')
    await scope.acquire({
      acquire: () => 'storage',
      close: async () => { throw closeFailure },
      name: 'storage',
    })
    const startupFailure = new Error('startup failed')

    const error = await scope.rollback(startupFailure).catch(cause => cause)

    expect(databaseClose).not.toHaveBeenCalled()
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).message).toBe('Application startup and resource rollback failed')
    expect((error as AggregateError).errors).toEqual([
      startupFailure,
      expect.objectContaining({ cause: closeFailure, message: 'Failed to close storage' }),
    ])
  })

  it('drains an admitted acquisition before closing its resource', async () => {
    const acquisition = deferred<string>()
    const close = vi.fn(async () => undefined)
    const scope = createResourceScope('Application')

    const acquiring = scope.acquire({
      acquire: () => acquisition.promise,
      close,
      name: 'database',
    })
    const closing = scope.close()
    acquisition.resolve('database')

    await acquiring
    await closing
    expect(close).toHaveBeenCalledOnce()
  })

  it('seals ownership transfer when startup commits', async () => {
    const close = vi.fn(async () => undefined)
    const scope = createResourceScope('Application')
    const acquired = await scope.acquire({
      acquire: () => 'database',
      close,
      name: 'database',
    })

    scope.commit()

    expect(() => acquired.transfer()).toThrow('Application resource scope is committed')
    await scope.close()
    expect(close).toHaveBeenCalledOnce()
  })

  it('attempts every finalizer and retries only failures', async () => {
    const scope = createResourceScope('Application')
    const failure = new Error('database busy')
    const databaseClose = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined)
    const storageClose = vi.fn().mockResolvedValue(undefined)
    await scope.acquire({ acquire: () => 'database', close: databaseClose, name: 'database' })
    await scope.acquire({ acquire: () => 'storage', close: storageClose, name: 'storage' })
    scope.commit()

    const error = await scope.close().catch(cause => cause)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({ cause: failure, message: 'Failed to close database' }),
    ])
    expect(storageClose).toHaveBeenCalledOnce()
    await expect(scope.close()).resolves.toBeUndefined()
    expect(databaseClose).toHaveBeenCalledTimes(2)
    expect(storageClose).toHaveBeenCalledOnce()
  })

  it('stops at a failed dependent resource and resumes from it on retry', async () => {
    const scope = createResourceScope('Desktop services', { closeMode: 'dependent' })
    const shelfClose = vi.fn().mockResolvedValue(undefined)
    const failure = new Error('handler still registered')
    const ipcClose = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined)
    await scope.acquire({ acquire: () => 'shelf', close: shelfClose, name: 'Shelf operations' })
    await scope.acquire({ acquire: () => 'ipc', close: ipcClose, name: 'IPC registry' })
    scope.commit()

    await expect(scope.close()).rejects.toEqual(
      new Error('Failed to close IPC registry', { cause: failure }),
    )
    expect(shelfClose).not.toHaveBeenCalled()

    await expect(scope.close()).resolves.toBeUndefined()
    expect(ipcClose).toHaveBeenCalledTimes(2)
    expect(shelfClose).toHaveBeenCalledOnce()
  })

  it('still attempts every acquired resource during dependent startup rollback', async () => {
    const scope = createResourceScope('Application', { closeMode: 'dependent' })
    const databaseClose = vi.fn(async () => undefined)
    const storageFailure = new Error('storage startup cleanup failed')
    await scope.acquire({ acquire: () => 'database', close: databaseClose, name: 'database' })
    await scope.acquire({
      acquire: () => 'storage',
      close: async () => { throw storageFailure },
      name: 'storage',
    })
    const startupFailure = new Error('startup failed')

    const error = await scope.rollback(startupFailure).catch(cause => cause)

    expect(databaseClose).toHaveBeenCalledOnce()
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([
      startupFailure,
      expect.objectContaining({ cause: storageFailure, message: 'Failed to close storage' }),
    ])
  })

  it('shares cancellation close with rollback without finalizing twice', async () => {
    const scope = createResourceScope('Application', { closeMode: 'dependent' })
    const resourceClose = vi.fn(async () => undefined)
    await scope.acquire({
      acquire: () => 'resource',
      close: resourceClose,
      name: 'resource',
    })
    const startupFailure = new Error('startup interrupted')

    const cancellationClose = scope.close()
    const rollback = scope.rollback(startupFailure)

    await expect(cancellationClose).resolves.toBeUndefined()
    await expect(rollback).rejects.toBe(startupFailure)
    expect(resourceClose).toHaveBeenCalledOnce()
  })

  it('shares concurrent close attempts and rejects acquisition after commit', async () => {
    const closing = deferred<void>()
    const scope = createResourceScope('Application')
    await scope.acquire({
      acquire: () => 'database',
      close: () => closing.promise,
      name: 'database',
    })
    scope.commit()

    await expect(scope.acquire({
      acquire: () => 'late',
      close: async () => undefined,
      name: 'late resource',
    })).rejects.toThrow('Application resource scope is committed')
    const first = scope.close()
    expect(scope.isClosed()).toBe(true)
    expect(scope.close()).toBe(first)
    closing.resolve()
    await first
    expect(scope.close()).toBe(first)
  })
})
