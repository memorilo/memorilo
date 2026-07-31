import type {
  AddShelfSourceInput,
  BrowseShelfInput,
  DesktopApi,
  DesktopNote,
  DesktopNoteWriteReceipt,
  DesktopStoredTopicBlock,
  DesktopTopicBlockSearchHit,
  DesktopTopicBlockSearchMode,
  RuntimeInfo,
  SaveDesktopNoteUpdatesInput,
  ShelfAssetInput,
  ShelfAssetResult,
  ShelfBrowseResult,
  ShelfSource,
  UpdateShelfSourceInput,
} from './contract'

export interface DesktopServices {
  app: {
    getRuntimeInfo: () => Promise<RuntimeInfo>
  }
  notes: {
    getTopicBlock: (input: { blockId: string, noteId: string, topicId: string }) => Promise<DesktopStoredTopicBlock | null>
    openMostRecentNote: () => Promise<DesktopNote>
    saveNoteUpdates: (input: SaveDesktopNoteUpdatesInput) => Promise<DesktopNoteWriteReceipt>
    searchTopicBlocks: (input: {
      limit?: number
      mode?: DesktopTopicBlockSearchMode
      noteId?: string
      query: string
    }) => Promise<readonly DesktopTopicBlockSearchHit[]>
  }
  shelf: {
    addSource: (input: AddShelfSourceInput) => Promise<ShelfSource>
    getAsset: (input: ShelfAssetInput) => Promise<ShelfAssetResult>
    getCachedView: (input: BrowseShelfInput) => Promise<ShelfBrowseResult>
    listSources: () => Promise<readonly ShelfSource[]>
    refreshView: (input: BrowseShelfInput) => Promise<ShelfBrowseResult>
    removeSource: (sourceId: string) => Promise<void>
    updateSource: (input: UpdateShelfSourceInput) => Promise<ShelfSource>
  }
}

export function createDesktopApi(services: DesktopServices): DesktopApi {
  return {
    addShelfSource: input => services.shelf.addSource(input),
    getCachedShelfView: input => services.shelf.getCachedView(input),
    getRuntimeInfo: () => services.app.getRuntimeInfo(),
    getShelfAsset: input => services.shelf.getAsset(input),
    getTopicBlock: input => services.notes.getTopicBlock(input),
    listShelfSources: () => services.shelf.listSources(),
    openMostRecentNote: () => services.notes.openMostRecentNote(),
    refreshShelfView: input => services.shelf.refreshView(input),
    removeShelfSource: sourceId => services.shelf.removeSource(sourceId),
    updateShelfSource: input => services.shelf.updateSource(input),
    saveNoteUpdates: input => services.notes.saveNoteUpdates(input),
    searchTopicBlocks: input => services.notes.searchTopicBlocks(input),
  }
}
