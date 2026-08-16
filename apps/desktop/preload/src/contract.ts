import type {
  DesktopConfiguration,
  DesktopNoteExternalUpdate,
  DesktopWhiteboardLibraryData,
} from '@memorilo/desktop-api'
import type {
  DesktopFetchRequest,
  DesktopFetchResponse,
} from '@memorilo/desktop-api/transport'

export type * from '@memorilo/desktop-api'

export interface DesktopApi {
  loadWhiteboardLibrary: () => Promise<DesktopWhiteboardLibraryData>
  request: (request: DesktopFetchRequest) => Promise<DesktopFetchResponse>
  saveWhiteboardLibrary: (data: DesktopWhiteboardLibraryData) => Promise<void>
  subscribeConfiguration: (listener: (configuration: DesktopConfiguration) => void) => () => void
  subscribeNoteSaveRequests: (listener: () => Promise<void>) => () => void
  subscribeNoteUpdates: (listener: (update: DesktopNoteExternalUpdate) => void) => () => void
}
