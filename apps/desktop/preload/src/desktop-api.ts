import type { DesktopApi } from './contract'
import type { DesktopIpcClient } from './ipc-contract'

export function createDesktopApi(
  services: DesktopIpcClient,
  subscribeConfiguration: DesktopApi['subscribeConfiguration'],
  subscribeNoteSaveRequests: DesktopApi['subscribeNoteSaveRequests'],
  subscribeNoteUpdates: DesktopApi['subscribeNoteUpdates'],
): DesktopApi {
  return {
    loadWhiteboardLibrary: () => services.whiteboardLibrary.load(),
    request: request => services.transport.fetch(request),
    saveWhiteboardLibrary: data => services.whiteboardLibrary.save(data),
    subscribeConfiguration,
    subscribeNoteSaveRequests,
    subscribeNoteUpdates,
  }
}
