import type { DesktopFetchRequest, DesktopFetchResponse } from '@memorilo/desktop-api/transport'
import type { DesktopWhiteboardLibraryData } from './contract'

export {
  decodeDesktopIpcEnvelope,
  DesktopIpcError,
  desktopIpcFailure,
  DesktopIpcProtocolError,
  desktopIpcSuccess,
} from './ipc-wire'
export type { DesktopIpcEnvelope, DesktopIpcFailure } from './ipc-wire'

export interface DesktopIpcClient {
  transport: {
    fetch: (request: DesktopFetchRequest) => Promise<DesktopFetchResponse>
  }
  whiteboardLibrary: {
    load: () => Promise<DesktopWhiteboardLibraryData>
    save: (data: DesktopWhiteboardLibraryData) => Promise<void>
  }
}

type DesktopIpcChannels = {
  readonly [Group in keyof DesktopIpcClient]: {
    readonly [Method in keyof DesktopIpcClient[Group]]: string
  }
}

export const desktopIpcChannels = {
  transport: {
    fetch: 'memorilo:invoke:transport:fetch',
  },
  whiteboardLibrary: {
    load: 'memorilo:invoke:whiteboardLibrary:load',
    save: 'memorilo:invoke:whiteboardLibrary:save',
  },
} as const satisfies DesktopIpcChannels
