import type { EditorNoteChange } from '@memorilo/editor'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'

import { NotePersistenceManager } from './note-persistence-manager'

function change(noteId: string, byte: number): EditorNoteChange {
  return { noteId, update: Uint8Array.from([byte]) }
}

describe('renderer Note persistence lifecycle', () => {
  it('cancels the debounce timer, drains accepted changes, and rejects admission after close', async () => {
    const saveNoteUpdates = vi.fn().mockResolvedValue({ updatedAt: 42 })
    const manager = new NotePersistenceManager({
      adapter: { saveNoteUpdates },
      debounceMs: 60_000,
    })
    manager.enqueue(change('note-1', 1))

    await manager.close()

    expect(saveNoteUpdates).toHaveBeenCalledOnce()
    expect(manager.getPendingChanges('note-1')).toEqual([])
    expect(() => manager.enqueue(change('note-1', 2))).toThrow('Note persistence manager is closed')
    expect(() => manager.replacePending(change('note-1', 2))).toThrow('Note persistence manager is closed')
  })

  it('shares close with an in-flight flush and waits for the accepted save', async () => {
    const saved = deferred<{ updatedAt: number }>()
    const manager = new NotePersistenceManager({
      adapter: { saveNoteUpdates: () => saved.promise },
    })
    manager.enqueue(change('note-1', 1))
    const flush = manager.flush()
    const firstClose = manager.close()
    const secondClose = manager.close()

    expect(secondClose).toBe(firstClose)
    let closed = false
    void firstClose.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)

    saved.resolve({ updatedAt: 42 })
    await expect(flush).resolves.toBeUndefined()
    await expect(firstClose).resolves.toBeUndefined()
  })

  it('retains failed changes and retries final close without reopening admission', async () => {
    const failure = new Error('disk full')
    const saveNoteUpdates = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ updatedAt: 42 })
    const manager = new NotePersistenceManager({ adapter: { saveNoteUpdates } })
    manager.enqueue(change('note-1', 1))

    await expect(manager.close()).rejects.toMatchObject({
      cause: failure,
      message: 'Failed to close pending Note updates',
    })
    expect(manager.getPendingChanges('note-1')).toEqual([change('note-1', 1)])
    expect(() => manager.enqueue(change('note-2', 2))).toThrow('Note persistence manager is closed')

    await expect(manager.close()).resolves.toBeUndefined()
    expect(manager.getPendingChanges('note-1')).toEqual([])
    expect(saveNoteUpdates).toHaveBeenCalledTimes(2)
  })

  it('rejects new subscriptions after close', async () => {
    const manager = new NotePersistenceManager({
      adapter: { saveNoteUpdates: vi.fn().mockResolvedValue({ updatedAt: 42 }) },
    })

    await manager.close()

    expect(() => manager.subscribe(() => undefined)).toThrow('Note persistence manager is closed')
    expect(() => manager.subscribeReceipts(() => undefined)).toThrow('Note persistence manager is closed')
  })

  it('isolates state listener failures from admission and later listeners', async () => {
    const failure = new Error('state listener failed')
    const onListenerError = vi.fn()
    const laterListener = vi.fn()
    const manager = new NotePersistenceManager({
      adapter: { saveNoteUpdates: vi.fn().mockResolvedValue({ updatedAt: 42 }) },
      onListenerError,
    })
    manager.subscribe(() => {
      throw failure
    })
    manager.subscribe(laterListener)

    expect(() => manager.enqueue(change('note-1', 1))).not.toThrow()
    await expect(manager.flush()).resolves.toBeUndefined()

    expect(onListenerError).toHaveBeenCalledWith(failure)
    expect(laterListener).toHaveBeenCalled()
    await manager.close()
  })

  it('does not retry a committed save when a receipt listener fails', async () => {
    const failure = new Error('receipt listener failed')
    const onListenerError = vi.fn()
    const laterListener = vi.fn()
    const saveNoteUpdates = vi.fn().mockResolvedValue({ updatedAt: 42 })
    const manager = new NotePersistenceManager({
      adapter: { saveNoteUpdates },
      onListenerError,
    })
    manager.subscribeReceipts(() => {
      throw failure
    })
    manager.subscribeReceipts(laterListener)
    manager.enqueue(change('note-1', 1))

    await expect(manager.flush()).resolves.toBeUndefined()

    expect(saveNoteUpdates).toHaveBeenCalledOnce()
    expect(manager.getPendingChanges('note-1')).toEqual([])
    expect(onListenerError).toHaveBeenCalledWith(failure)
    expect(laterListener).toHaveBeenCalledWith('note-1', { updatedAt: 42 })
    await manager.close()
  })
})
