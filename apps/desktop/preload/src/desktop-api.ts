import type {
  CreateDesktopNoteInput,
  DesktopApi,
  DesktopAssetCheckResult,
  DesktopColumnVisibilityMenuSelection,
  DesktopConfiguration,
  DesktopFavoriteNoteItem,
  DesktopNote,
  DesktopNoteFavoriteState,
  DesktopNotePage,
  DesktopNoteSearchHit,
  DesktopNoteWriteReceipt,
  DesktopRecentNoteItem,
  DesktopStoredTopicBlock,
  DesktopTopicBlockSearchHit,
  DesktopTopicBlockSearchMode,
  GetDesktopNoteInput,
  ImportDesktopNetworkImageInput,
  ListDesktopNotesInput,
  ReclaimDesktopAssetsInput,
  ReclaimDesktopAssetsResult,
  RecordDesktopNoteOpenedInput,
  RenameDesktopNoteInput,
  RenameDesktopNoteResult,
  RuntimeInfo,
  SaveDesktopImageInput,
  SaveDesktopImageResult,
  SaveDesktopNoteUpdatesInput,
  SetDesktopNoteFavoriteInput,
  ShowDesktopColumnVisibilityMenuInput,
} from './contract'

export interface DesktopServices {
  app: {
    getRuntimeInfo: () => Promise<RuntimeInfo>
  }
  assets: {
    check: () => Promise<DesktopAssetCheckResult>
    importNetworkImage: (input: ImportDesktopNetworkImageInput) => Promise<SaveDesktopImageResult>
    reclaim: (input: ReclaimDesktopAssetsInput) => Promise<ReclaimDesktopAssetsResult>
    saveImage: (input: SaveDesktopImageInput) => Promise<SaveDesktopImageResult>
  }
  configuration: {
    get: () => Promise<DesktopConfiguration>
    set: (configuration: DesktopConfiguration) => Promise<DesktopConfiguration>
  }
  notes: {
    createNote: (input?: CreateDesktopNoteInput) => Promise<DesktopNote>
    getNote: (input: GetDesktopNoteInput) => Promise<DesktopNote>
    getTopicBlock: (input: { blockId: string, noteId: string, topicId: string }) => Promise<DesktopStoredTopicBlock | null>
    listFavoriteNotes: (input?: { limit?: number }) => Promise<readonly DesktopFavoriteNoteItem[]>
    listNotes: (input?: ListDesktopNotesInput) => Promise<DesktopNotePage>
    listRecentNotes: (input?: { limit?: number }) => Promise<readonly DesktopRecentNoteItem[]>
    openMostRecentNote: () => Promise<DesktopNote>
    recordNoteOpened: (input: RecordDesktopNoteOpenedInput) => Promise<void>
    renameNote: (input: RenameDesktopNoteInput) => Promise<RenameDesktopNoteResult>
    saveNoteUpdates: (input: SaveDesktopNoteUpdatesInput) => Promise<DesktopNoteWriteReceipt>
    searchNotes: (input: {
      limit?: number
      query: string
    }) => Promise<readonly DesktopNoteSearchHit[]>
    searchTopicBlocks: (input: {
      limit?: number
      mode?: DesktopTopicBlockSearchMode
      noteId?: string
      query: string
    }) => Promise<readonly DesktopTopicBlockSearchHit[]>
    setNoteFavorite: (input: SetDesktopNoteFavoriteInput) => Promise<DesktopNoteFavoriteState>
  }
  window: {
    showColumnVisibilityMenu: (
      input: ShowDesktopColumnVisibilityMenuInput,
    ) => Promise<DesktopColumnVisibilityMenuSelection | null>
  }
}

export function createDesktopApi(
  services: DesktopServices,
  subscribeConfiguration: DesktopApi['subscribeConfiguration'],
): DesktopApi {
  return {
    checkAssets: () => services.assets.check(),
    createNote: input => services.notes.createNote(input),
    getConfiguration: () => services.configuration.get(),
    getNote: input => services.notes.getNote(input),
    getRuntimeInfo: () => services.app.getRuntimeInfo(),
    getTopicBlock: input => services.notes.getTopicBlock(input),
    importNetworkImage: input => services.assets.importNetworkImage(input),
    listFavoriteNotes: input => services.notes.listFavoriteNotes(input),
    listNotes: input => services.notes.listNotes(input),
    listRecentNotes: input => services.notes.listRecentNotes(input),
    openMostRecentNote: () => services.notes.openMostRecentNote(),
    reclaimAssets: input => services.assets.reclaim(input),
    recordNoteOpened: input => services.notes.recordNoteOpened(input),
    renameNote: input => services.notes.renameNote(input),
    saveImage: input => services.assets.saveImage(input),
    saveNoteUpdates: input => services.notes.saveNoteUpdates(input),
    searchNotes: input => services.notes.searchNotes(input),
    searchTopicBlocks: input => services.notes.searchTopicBlocks(input),
    setNoteFavorite: input => services.notes.setNoteFavorite(input),
    setConfiguration: configuration => services.configuration.set(configuration),
    showColumnVisibilityMenu: input => services.window.showColumnVisibilityMenu(input),
    subscribeConfiguration,
  }
}
