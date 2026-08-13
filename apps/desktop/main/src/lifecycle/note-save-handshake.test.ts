import type { NoteSaveRequest, NoteSaveResult } from '@memorilo/desktop-preload/note-save-handshake'
import { EventEmitter } from 'node:events'
import { noteSaveResultChannel } from '@memorilo/desktop-preload/note-save-handshake'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushRendererNotes } from './note-save-handshake'

function createFixture() {
  const ipc = new EventEmitter()
  const ipcMain = {
    off: (channel: string, listener: (event: Electron.IpcMainEvent, result: NoteSaveResult) => void) => ipc.off(channel, listener),
    on: (channel: string, listener: (event: Electron.IpcMainEvent, result: NoteSaveResult) => void) => ipc.on(channel, listener),
  }
  const sent: Array<{ id: number, request: NoteSaveRequest }> = []
  const target = (id: number, initiallyDestroyed = false) => {
    const events = new EventEmitter()
    let destroyed = initiallyDestroyed
    return {
      destroy: () => {
        destroyed = true
        events.emit('destroyed')
      },
      destroyedListenerCount: () => events.listenerCount('destroyed'),
      id,
      isDestroyed: () => destroyed,
      once: (event: 'destroyed', listener: () => void) => events.once(event, listener),
      removeListener: (event: 'destroyed', listener: () => void) => events.removeListener(event, listener),
      send: (_channel: string, request: NoteSaveRequest) => sent.push({ id, request }),
    }
  }
  const respond = (id: number, result: NoteSaveResult) => {
    ipc.emit(noteSaveResultChannel, { sender: { id } }, result)
  }
  return { ipc, ipcMain, respond, sent, target }
}

afterEach(() => vi.useRealTimers())

describe('renderer Note save handshake', () => {
  it('succeeds immediately when there are no live renderers', async () => {
    const fixture = createFixture()
    await expect(flushRendererNotes({
      ipcMain: fixture.ipcMain,
      targets: [fixture.target(1, true)],
    })).resolves.toEqual({ status: 'saved' })
    expect(fixture.sent).toEqual([])
  })

  it('waits for every live renderer and ignores destroyed targets', async () => {
    const fixture = createFixture()
    const outcome = flushRendererNotes({
      ipcMain: fixture.ipcMain,
      targets: [fixture.target(1), fixture.target(2), fixture.target(3, true)],
    })
    const requestId = fixture.sent[0]?.request.requestId
    if (!requestId)
      throw new Error('No save request was sent')

    fixture.respond(1, { requestId, status: 'saved' })
    let settled = false
    void outcome.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    fixture.respond(2, { requestId, status: 'saved' })

    await expect(outcome).resolves.toEqual({ status: 'saved' })
    expect(fixture.sent.map(item => item.id)).toEqual([1, 2])
    expect(fixture.ipc.listenerCount(noteSaveResultChannel)).toBe(0)
  })

  it('returns renderer failure instead of acknowledging it as saved', async () => {
    const fixture = createFixture()
    const outcome = flushRendererNotes({ ipcMain: fixture.ipcMain, targets: [fixture.target(1)] })
    const requestId = fixture.sent[0]?.request.requestId
    if (!requestId)
      throw new Error('No save request was sent')

    fixture.respond(1, { message: 'disk full', requestId, status: 'failed' })

    await expect(outcome).resolves.toEqual({ message: 'disk full', status: 'failed' })
  })

  it('times out with pending renderer IDs and removes its listener', async () => {
    vi.useFakeTimers()
    const fixture = createFixture()
    const outcome = flushRendererNotes({
      ipcMain: fixture.ipcMain,
      targets: [fixture.target(7)],
      timeoutMs: 5_000,
    })

    await vi.advanceTimersByTimeAsync(5_000)

    await expect(outcome).resolves.toEqual({ pendingRendererIds: [7], status: 'timed-out' })
    expect(fixture.ipc.listenerCount(noteSaveResultChannel)).toBe(0)
  })

  it('correlates concurrent requests and ignores unrelated or duplicate responses', async () => {
    const fixture = createFixture()
    const first = flushRendererNotes({ ipcMain: fixture.ipcMain, targets: [fixture.target(1)] })
    const firstRequestId = fixture.sent[0]?.request.requestId
    const second = flushRendererNotes({ ipcMain: fixture.ipcMain, targets: [fixture.target(1)] })
    const secondRequestId = fixture.sent[1]?.request.requestId
    if (!firstRequestId || !secondRequestId)
      throw new Error('Save requests were not sent')

    fixture.respond(99, { requestId: firstRequestId, status: 'saved' })
    fixture.respond(1, { requestId: secondRequestId, status: 'saved' })
    fixture.respond(1, { requestId: secondRequestId, status: 'saved' })
    await expect(second).resolves.toEqual({ status: 'saved' })
    fixture.respond(1, { requestId: firstRequestId, status: 'saved' })
    await expect(first).resolves.toEqual({ status: 'saved' })
  })

  it('fails immediately and releases listeners when a renderer is destroyed while saving', async () => {
    const fixture = createFixture()
    const target = fixture.target(7)
    const outcome = flushRendererNotes({ ipcMain: fixture.ipcMain, targets: [target] })

    expect(target.destroyedListenerCount()).toBe(1)
    target.destroy()

    await expect(outcome).resolves.toEqual({
      message: 'Renderer 7 closed before confirming its Note save',
      status: 'failed',
    })
    expect(target.destroyedListenerCount()).toBe(0)
    expect(fixture.ipc.listenerCount(noteSaveResultChannel)).toBe(0)
  })

  it('turns a send failure into a failed outcome without leaking listeners', async () => {
    const fixture = createFixture()
    const target = fixture.target(9)
    target.send = () => {
      throw new Error('renderer unavailable')
    }

    await expect(
      flushRendererNotes({ ipcMain: fixture.ipcMain, targets: [target] }),
    ).resolves.toEqual({ message: 'renderer unavailable', status: 'failed' })
    expect(target.destroyedListenerCount()).toBe(0)
    expect(fixture.ipc.listenerCount(noteSaveResultChannel)).toBe(0)
  })

  it('runs every listener finalizer when one cleanup operation fails', async () => {
    const fixture = createFixture()
    const first = fixture.target(1)
    const second = fixture.target(2)
    const firstRemoveListener = vi.fn(first.removeListener)
    const secondRemoveListener = vi.fn(() => {
      throw new Error('second listener cleanup failed')
    })
    first.removeListener = firstRemoveListener
    second.removeListener = secondRemoveListener

    const outcome = flushRendererNotes({ ipcMain: fixture.ipcMain, targets: [first, second] })
    const requestId = fixture.sent[0]?.request.requestId
    if (!requestId)
      throw new Error('No save request was sent')
    fixture.respond(1, { requestId, status: 'saved' })
    fixture.respond(2, { requestId, status: 'saved' })

    await expect(outcome).resolves.toEqual({
      message: 'second listener cleanup failed',
      status: 'failed',
    })
    expect(firstRemoveListener).toHaveBeenCalledOnce()
    expect(secondRemoveListener).toHaveBeenCalledOnce()
    expect(fixture.ipc.listenerCount(noteSaveResultChannel)).toBe(0)
  })
})
