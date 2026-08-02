import type { DesktopApi, DesktopNoteExternalUpdate } from './contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  ipcOn: vi.fn(),
  ipcRemoveListener: vi.fn(),
  services: {},
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
  ipcRenderer: { on: mocks.ipcOn, removeListener: mocks.ipcRemoveListener },
}))

vi.mock('electron-ipc-decorator/client', () => ({
  createIpcProxy: () => mocks.services,
}))

await import('./index')

function exposedApi(): DesktopApi {
  const exposed = mocks.exposeInMainWorld.mock.calls.find(([name]) => name === 'desktop')?.[1]
  if (!exposed)
    throw new Error('Preload did not expose the desktop API')
  return exposed as DesktopApi
}

beforeEach(() => {
  mocks.ipcOn.mockClear()
  mocks.ipcRemoveListener.mockClear()
})

describe('preload IPC bridge', () => {
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
