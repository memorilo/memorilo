import type { IpcRenderer } from 'electron'
import type { DesktopIpcClient } from './ipc-contract'
import { desktopIpcChannels } from './ipc-contract'

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>

function createGroupClient(channels: Readonly<Record<string, string>>, invoke: Invoke) {
  return Object.fromEntries(
    Object.entries(channels).map(([method, channel]) => [
      method,
      (...args: unknown[]) => invoke(channel, ...args),
    ]),
  )
}

export function createDesktopIpcClient(renderer: Pick<IpcRenderer, 'invoke'>): DesktopIpcClient {
  const invoke: Invoke = (channel, ...args) => renderer.invoke(channel, ...args)
  return {
    app: createGroupClient(desktopIpcChannels.app, invoke),
    assets: createGroupClient(desktopIpcChannels.assets, invoke),
    books: createGroupClient(desktopIpcChannels.books, invoke),
    configuration: createGroupClient(desktopIpcChannels.configuration, invoke),
    journals: createGroupClient(desktopIpcChannels.journals, invoke),
    learning: createGroupClient(desktopIpcChannels.learning, invoke),
    notes: createGroupClient(desktopIpcChannels.notes, invoke),
    whiteboardLibrary: createGroupClient(desktopIpcChannels.whiteboardLibrary, invoke),
    shelf: createGroupClient(desktopIpcChannels.shelf, invoke),
    window: createGroupClient(desktopIpcChannels.window, invoke),
  } as unknown as DesktopIpcClient
}
