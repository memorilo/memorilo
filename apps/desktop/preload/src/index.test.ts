import type { DesktopApi, DesktopNoteExternalUpdate } from './contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  ipcInvoke: vi.fn(),
  ipcOn: vi.fn(),
  ipcRemoveListener: vi.fn(),
  ipcSend: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: mocks.ipcInvoke,
    on: mocks.ipcOn,
    removeListener: mocks.ipcRemoveListener,
    send: mocks.ipcSend,
  },
}))

await import('./index')

function exposedApi(): DesktopApi {
  const exposed = mocks.exposeInMainWorld.mock.calls.find(([name]) => name === 'desktop')?.[1]
  if (!exposed)
    throw new Error('Preload did not expose the desktop API')
  return exposed as DesktopApi
}

beforeEach(() => {
  mocks.ipcInvoke.mockReset()
  mocks.ipcRemoveListener.mockClear()
  mocks.ipcSend.mockClear()
})

describe('preload IPC bridge', () => {
  it('invokes stable application-owned channels with the original arguments', async () => {
    mocks.ipcInvoke.mockResolvedValueOnce({ platform: 'win32', version: '43.2.0' })
    await expect(exposedApi().getRuntimeInfo()).resolves.toEqual({
      platform: 'win32',
      version: '43.2.0',
    })
    expect(mocks.ipcInvoke).toHaveBeenCalledWith('memorilo:invoke:app:getRuntimeInfo')

    mocks.ipcInvoke.mockResolvedValueOnce({ reduceMotion: true })
    await exposedApi().setConfigurationValue('reduceMotion', true)
    expect(mocks.ipcInvoke).toHaveBeenLastCalledWith(
      'memorilo:invoke:configuration:setValue',
      'reduceMotion',
      true,
    )
  })

  it('waits for all Note save listeners and acknowledges the correlated request', async () => {
    const first = vi.fn().mockResolvedValue(undefined)
    const second = vi.fn().mockResolvedValue(undefined)
    const unsubscribeFirst = exposedApi().subscribeNoteSaveRequests(first)
    const unsubscribeSecond = exposedApi().subscribeNoteSaveRequests(second)
    const registration = mocks.ipcOn.mock.calls.find(([channel]) => channel === 'memorilo:note-save-request')
    const handler = registration?.[1] as ((event: unknown, request: { requestId: string }) => Promise<void>) | undefined
    if (!handler)
      throw new Error('Preload did not register the Note save request channel')

    await handler({}, { requestId: 'request-1' })

    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    expect(mocks.ipcSend).toHaveBeenCalledWith('memorilo:note-save-result', {
      requestId: 'request-1',
      status: 'saved',
    })
    unsubscribeFirst()
    unsubscribeSecond()
    await handler({}, { requestId: 'request-2' })
    expect(first).toHaveBeenCalledOnce()
  })

  it('reports a failed Note save instead of acknowledging success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const unsubscribe = exposedApi().subscribeNoteSaveRequests(() => Promise.reject(new Error('disk full')))
    const registration = mocks.ipcOn.mock.calls.find(([channel]) => channel === 'memorilo:note-save-request')
    const handler = registration?.[1] as ((event: unknown, request: { requestId: string }) => Promise<void>) | undefined
    if (!handler)
      throw new Error('Preload did not register the Note save request channel')

    await handler({}, { requestId: 'request-failed' })

    expect(mocks.ipcSend).toHaveBeenCalledWith('memorilo:note-save-result', {
      message: 'disk full',
      requestId: 'request-failed',
      status: 'failed',
    })
    unsubscribe()
  })

  it('serializes overlapping Note save requests', async () => {
    let releaseFirst!: () => void
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    let calls = 0
    const listener = vi.fn(async () => {
      calls += 1
      if (calls === 1)
        await firstReleased
    })
    const unsubscribe = exposedApi().subscribeNoteSaveRequests(listener)
    const registration = mocks.ipcOn.mock.calls.find(([channel]) => channel === 'memorilo:note-save-request')
    const handler = registration?.[1] as ((event: unknown, request: { requestId: string }) => Promise<void>) | undefined
    if (!handler)
      throw new Error('Preload did not register the Note save request channel')

    const first = handler({}, { requestId: 'request-serial-1' })
    const second = handler({}, { requestId: 'request-serial-2' })
    await Promise.resolve()
    expect(listener).toHaveBeenCalledOnce()
    releaseFirst()
    await Promise.all([first, second])
    expect(listener).toHaveBeenCalledTimes(2)
    expect(mocks.ipcSend).toHaveBeenNthCalledWith(1, 'memorilo:note-save-result', {
      requestId: 'request-serial-1',
      status: 'saved',
    })
    expect(mocks.ipcSend).toHaveBeenNthCalledWith(2, 'memorilo:note-save-result', {
      requestId: 'request-serial-2',
      status: 'saved',
    })
    unsubscribe()
  })

  it('subscribes to the external Note update channel and removes the same handler', () => {
    const listener = vi.fn()
    const unsubscribe = exposedApi().subscribeNoteUpdates(listener)
    const registration = mocks.ipcOn.mock.calls.find(([channel]) => channel === 'memorilo:note-update')
    const handler = registration?.[1] as ((event: unknown, update: DesktopNoteExternalUpdate) => void) | undefined
    if (!handler)
      throw new Error('Preload did not register the external Note update channel')
    const update = { noteId: 'note-1', update: Uint8Array.from([1, 2, 3]), updatedAt: 42 }

    handler({}, update)
    expect(listener).toHaveBeenCalledWith(update)
    unsubscribe()
    expect(mocks.ipcRemoveListener).toHaveBeenCalledWith('memorilo:note-update', handler)
  })
})
