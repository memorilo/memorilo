import type { EditorNoteChange } from '@memorilo/editor'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotePersistenceManager } from './note-persistence-manager'

function change(noteId: string, byte: number): EditorNoteChange {
  return { noteId, update: Uint8Array.from([byte]) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('renderer Note persistence manager', () => {
  it('debounces updates for one Note into one write-through save', async () => {
    vi.useFakeTimers()
    const saveNoteUpdates = vi.fn().mockResolvedValue({ updatedAt: 42 })
    const manager = new NotePersistenceManager({ adapter: { saveNoteUpdates }, debounceMs: 250 })
    manager.enqueue(change('note-1', 1))
    manager.enqueue(change('note-1', 2))

    await vi.advanceTimersByTimeAsync(249)
    expect(saveNoteUpdates).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await vi.runAllTimersAsync()

    expect(saveNoteUpdates).toHaveBeenCalledOnce()
    expect(saveNoteUpdates).toHaveBeenCalledWith({
      noteId: 'note-1',
      updates: [Uint8Array.from([1]), Uint8Array.from([2])],
    })
    expect(manager.getPendingChanges('note-1')).toEqual([])
  })

  it('keeps changes queued after the producing route unmounts and drains multiple Notes separately', async () => {
    const saveNoteUpdates = vi.fn().mockResolvedValue({ updatedAt: 42 })
    const manager = new NotePersistenceManager({ adapter: { saveNoteUpdates } })
    manager.enqueue(change('note-1', 1))
    manager.enqueue(change('note-2', 2))

    await manager.flush()

    expect(saveNoteUpdates.mock.calls).toEqual([
      [{ noteId: 'note-1', updates: [Uint8Array.from([1])] }],
      [{ noteId: 'note-2', updates: [Uint8Array.from([2])] }],
    ])
  })

  it('drains updates enqueued while a save is in flight', async () => {
    const first = deferred<{ updatedAt: number }>()
    const saveNoteUpdates = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ updatedAt: 2 })
    const manager = new NotePersistenceManager({ adapter: { saveNoteUpdates } })
    manager.enqueue(change('note-1', 1))
    const flush = manager.flush()
    await vi.waitFor(() => expect(saveNoteUpdates).toHaveBeenCalledOnce())

    manager.enqueue(change('note-1', 2))
    first.resolve({ updatedAt: 1 })
    await flush

    expect(saveNoteUpdates.mock.calls).toEqual([
      [{ noteId: 'note-1', updates: [Uint8Array.from([1])] }],
      [{ noteId: 'note-1', updates: [Uint8Array.from([2])] }],
    ])
  })

  it('replaces queued updates with one authoritative recovery update', async () => {
    const saveNoteUpdates = vi.fn().mockResolvedValue({ updatedAt: 42 })
    const manager = new NotePersistenceManager({ adapter: { saveNoteUpdates }, debounceMs: 60_000 })
    manager.enqueue(change('note-1', 1))
    manager.enqueue(change('note-1', 2))

    manager.replacePending(change('note-1', 9))
    await manager.flush()

    expect(saveNoteUpdates).toHaveBeenCalledOnce()
    expect(saveNoteUpdates).toHaveBeenCalledWith({
      noteId: 'note-1',
      updates: [Uint8Array.from([9])],
    })
  })

  it('restores a failed in-flight batch ahead of updates that arrived later', async () => {
    const first = deferred<{ updatedAt: number }>()
    const saveNoteUpdates = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ updatedAt: 42 })
    const manager = new NotePersistenceManager({ adapter: { saveNoteUpdates } })
    manager.enqueue(change('note-1', 1))
    const flush = manager.flush()
    await vi.waitFor(() => expect(saveNoteUpdates).toHaveBeenCalledOnce())
    manager.enqueue(change('note-1', 2))

    first.reject(new Error('temporary failure'))
    await expect(flush).rejects.toThrow('temporary failure')
    expect(manager.getPendingChanges('note-1')).toEqual([change('note-1', 1), change('note-1', 2)])

    await manager.retry()
    expect(saveNoteUpdates).toHaveBeenLastCalledWith({
      noteId: 'note-1',
      updates: [Uint8Array.from([1]), Uint8Array.from([2])],
    })
  })

  it('does not restore a failed in-flight batch after an authoritative replacement', async () => {
    const first = deferred<{ updatedAt: number }>()
    const failure = new Error('obsolete batch failed')
    const saveNoteUpdates = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ updatedAt: 42 })
    const manager = new NotePersistenceManager({ adapter: { saveNoteUpdates } })
    manager.enqueue(change('note-1', 1))
    const flush = manager.flush()
    await vi.waitFor(() => expect(saveNoteUpdates).toHaveBeenCalledOnce())

    manager.replacePending(change('note-1', 9))
    first.reject(failure)

    await expect(flush).rejects.toBe(failure)
    expect(manager.getPendingChanges('note-1')).toEqual([change('note-1', 9)])
    expect(manager.getError('note-1')).toBe(failure)

    await manager.retry()
    expect(saveNoteUpdates).toHaveBeenLastCalledWith({
      noteId: 'note-1',
      updates: [Uint8Array.from([9])],
    })
    expect(manager.getError('note-1')).toBeNull()
  })

  it('attributes a failed save only to its Note', async () => {
    const failure = new Error('note-1 failed')
    const saveNoteUpdates = vi.fn(async ({ noteId }: { noteId: string }) => {
      if (noteId === 'note-1')
        throw failure
      return { updatedAt: 42 }
    })
    const manager = new NotePersistenceManager({ adapter: { saveNoteUpdates } })
    manager.enqueue(change('note-1', 1))
    manager.enqueue(change('note-2', 2))

    await expect(manager.flush()).rejects.toBe(failure)

    expect(manager.getError('note-1')).toBe(failure)
    expect(manager.getError('note-2')).toBeNull()
  })

  it('rejects a failed final flush, retains the batch, and succeeds when retried', async () => {
    const failure = new Error('disk full')
    const saveNoteUpdates = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ updatedAt: 42 })
    const manager = new NotePersistenceManager({ adapter: { saveNoteUpdates } })
    manager.enqueue(change('note-1', 1))

    await expect(manager.flush()).rejects.toBe(failure)
    expect(manager.getSnapshot()).toEqual({ pendingNoteIds: ['note-1'], saving: false })
    expect(manager.getError('note-1')).toBe(failure)
    expect(manager.getPendingChanges('note-1')).toEqual([change('note-1', 1)])

    await manager.retry()
    expect(manager.getSnapshot()).toEqual({ pendingNoteIds: [], saving: false })
    expect(manager.getError('note-1')).toBeNull()
  })

  it('shares concurrent flushes and reports successful receipts', async () => {
    const saved = deferred<{ updatedAt: number }>()
    const saveNoteUpdates = vi.fn(() => saved.promise)
    const receipt = vi.fn()
    const manager = new NotePersistenceManager({ adapter: { saveNoteUpdates } })
    manager.subscribeReceipts(receipt)
    manager.enqueue(change('note-1', 1))

    const first = manager.flush()
    const second = manager.flush()
    expect(second).toBe(first)
    saved.resolve({ updatedAt: 42 })
    await first

    expect(saveNoteUpdates).toHaveBeenCalledOnce()
    expect(receipt).toHaveBeenCalledWith('note-1', { updatedAt: 42 })
  })
})
