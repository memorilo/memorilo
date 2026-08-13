import type { LibraryPersistenceAdapter } from '@excalidraw/excalidraw'

export const whiteboardLibraryPersistenceAdapter: LibraryPersistenceAdapter = {
  load: () => window.desktop.loadWhiteboardLibrary(),
  save: data => window.desktop.saveWhiteboardLibrary(data),
}
