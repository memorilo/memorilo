import type { WhiteboardLibraryApplication } from '../whiteboard/whiteboard-library-application'

export function createWhiteboardLibraryHandlers(application: WhiteboardLibraryApplication) {
  return {
    load: () => application.load(),
    save: (data: Parameters<WhiteboardLibraryApplication['save']>[0]) => application.save(data),
  }
}
