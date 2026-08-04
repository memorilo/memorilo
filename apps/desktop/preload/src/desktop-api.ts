import type {
  AddShelfSourceInput,
  BrowseShelfInput,
  DesktopApi,
  DesktopConfiguration,
  DesktopNote,
  DesktopNoteWriteReceipt,
  DesktopStoredTopicBlock,
  DesktopTopicBlockSearchHit,
  DesktopTopicBlockSearchMode,
  OpenShelfReadingInput,
  PreparedShelfReading,
  PrepareShelfReadingInput,
  RuntimeInfo,
  SaveDesktopNoteUpdatesInput,
  ShelfAssetInput,
  ShelfAssetResult,
  ShelfBrowseResult,
  ShelfPublicationDetails,
  ShelfPublicationDetailsInput,
  ShelfReadingDocument,
  ShelfSource,
  UpdateShelfSourceInput,
} from './contract'

export interface DesktopServices {
  app: {
    getRuntimeInfo: () => Promise<RuntimeInfo>
  }
  configuration: {
    get: () => Promise<DesktopConfiguration>
    set: (configuration: DesktopConfiguration) => Promise<DesktopConfiguration>
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
    getPublicationDetails: (input: ShelfPublicationDetailsInput) => Promise<ShelfPublicationDetails>
    openReading: (input: OpenShelfReadingInput) => Promise<ShelfReadingDocument>
    listSources: () => Promise<readonly ShelfSource[]>
    refreshView: (input: BrowseShelfInput) => Promise<ShelfBrowseResult>
    prepareReading: (input: PrepareShelfReadingInput) => Promise<PreparedShelfReading>
    deleteReading: (readingId: string) => Promise<boolean>
    removeSource: (sourceId: string) => Promise<void>
    updateSource: (input: UpdateShelfSourceInput) => Promise<ShelfSource>
  }
}

export function createDesktopApi(
  services: DesktopServices,
  subscribeConfiguration: DesktopApi['subscribeConfiguration'],
): DesktopApi {
  return {
    addShelfSource: input => services.shelf.addSource(input),
    deleteShelfReading: readingId => services.shelf.deleteReading(readingId),
    getCachedShelfView: input => services.shelf.getCachedView(input),
    getConfiguration: () => services.configuration.get(),
    getShelfPublicationDetails: input => services.shelf.getPublicationDetails(input),
    getRuntimeInfo: () => services.app.getRuntimeInfo(),
    getShelfAsset: input => services.shelf.getAsset(input),
    openShelfReading: input => services.shelf.openReading(input),
    getTopicBlock: input => services.notes.getTopicBlock(input),
    listShelfSources: () => services.shelf.listSources(),
    openMostRecentNote: () => services.notes.openMostRecentNote(),
    refreshShelfView: input => services.shelf.refreshView(input),
    prepareShelfReading: input => services.shelf.prepareReading(input),
    removeShelfSource: sourceId => services.shelf.removeSource(sourceId),
    saveNoteUpdates: input => services.notes.saveNoteUpdates(input),
    searchTopicBlocks: input => services.notes.searchTopicBlocks(input),
    setConfiguration: configuration => services.configuration.set(configuration),
    subscribeConfiguration,
    updateShelfSource: input => services.shelf.updateSource(input),
  }
}
