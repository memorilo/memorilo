import type {
  CreateDesktopNoteInput,
  DesktopApi,
  DesktopAssetCheckResult,
  DesktopColumnVisibilityMenuSelection,
  DesktopConfiguration,
  DesktopFavoriteNoteItem,
  DesktopJournalNote,
  DesktopJournalPage,
  DesktopNote,
  DesktopNoteExternalUpdate,
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
  JournalDate,
  ListDesktopJournalDatesInput,
  ListDesktopNotesInput,
  ListDesktopPastJournalsInput,
  OpenDesktopJournalInput,
  PruneDesktopPastEmptyJournalsResult,
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
  journals: {
    listJournalDates: (input: ListDesktopJournalDatesInput) => Promise<readonly JournalDate[]>
    listPastJournals: (input?: ListDesktopPastJournalsInput) => Promise<DesktopJournalPage>
    openJournal: (input?: OpenDesktopJournalInput) => Promise<DesktopJournalNote>
    prunePastEmptyJournals: () => Promise<PruneDesktopPastEmptyJournalsResult>
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
  subscribeNoteSaveRequests: DesktopApi['subscribeNoteSaveRequests'],
  subscribeNoteUpdates: (listener: (update: DesktopNoteExternalUpdate) => void) => () => void,
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
    listJournalDates: input => services.journals.listJournalDates(input),
    listNotes: input => services.notes.listNotes(input),
    listPastJournals: input => services.journals.listPastJournals(input),
    listRecentNotes: input => services.notes.listRecentNotes(input),
    openJournal: input => services.journals.openJournal(input),
    openMostRecentNote: () => services.notes.openMostRecentNote(),
    prunePastEmptyJournals: () => services.journals.prunePastEmptyJournals(),
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
    subscribeNoteSaveRequests,
    subscribeNoteUpdates,
  }
}
