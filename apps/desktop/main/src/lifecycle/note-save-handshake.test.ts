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
  const target = (id: number, destroyed = false) => ({
    id,
    isDestroyed: () => destroyed,
    send: (_channel: string, request: NoteSaveRequest) => sent.push({ id, request }),
  })
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
})
