import type {
  AddShelfSourceInput,
  BrowseShelfInput,
  CreateDesktopBookContextResult,
  CreateDesktopNoteInput,
  DesktopApi,
  DesktopAssetCheckResult,
  DesktopBookTopicContextSummary,
  DesktopColumnVisibilityMenuSelection,
  DesktopConfiguration,
  DesktopFavoriteNoteItem,
  DesktopJournalNote,
  DesktopJournalPage,
  DesktopLearningApi,
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
  OpenDesktopBookContextResult,
  OpenDesktopJournalInput,
  OpenShelfReadingInput,
  PreparedShelfReading,
  PrepareShelfReadingInput,
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
  ShelfAssetInput,
  ShelfAssetResult,
  ShelfBrowseResult,
  ShelfPublicationDetails,
  ShelfPublicationDetailsInput,
  ShelfReadingDocument,
  ShelfReadingRangeInput,
  ShelfSource,
  ShowDesktopColumnVisibilityMenuInput,
  UpdateShelfSourceInput,
} from './contract'

export interface DesktopServices {
  app: { getRuntimeInfo: () => Promise<RuntimeInfo> }
  assets: {
    check: () => Promise<DesktopAssetCheckResult>
    importNetworkImage: (input: ImportDesktopNetworkImageInput) => Promise<SaveDesktopImageResult>
    reclaim: (input: ReclaimDesktopAssetsInput) => Promise<ReclaimDesktopAssetsResult>
    saveImage: (input: SaveDesktopImageInput) => Promise<SaveDesktopImageResult>
  }
  books: {
    closeReadingSession: (sessionId: string) => Promise<boolean>
    createContext: (input: { noteTitle: string, readingId: string, topicTitle: string }) => Promise<CreateDesktopBookContextResult>
    isReadingAvailable: (readingId: string) => Promise<boolean>
    listContexts: (readingId: string) => Promise<readonly DesktopBookTopicContextSummary[]>
    rebindContext: (input: { noteId: string, readingId: string, sessionId?: string, topicId: string }) => Promise<OpenDesktopBookContextResult>
    selectContext: (input: { noteId: string, readingId: string, topicId: string }) => Promise<OpenDesktopBookContextResult>
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
  learning: DesktopLearningApi
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
    searchNotes: (input: { limit?: number, query: string }) => Promise<readonly DesktopNoteSearchHit[]>
    searchTopicBlocks: (input: { limit?: number, mode?: DesktopTopicBlockSearchMode, noteId?: string, query: string }) => Promise<readonly DesktopTopicBlockSearchHit[]>
    setNoteFavorite: (input: SetDesktopNoteFavoriteInput) => Promise<DesktopNoteFavoriteState>
  }
  shelf: {
    addSource: (input: AddShelfSourceInput) => Promise<ShelfSource>
    deleteReading: (readingId: string) => Promise<boolean>
    getAsset: (input: ShelfAssetInput) => Promise<ShelfAssetResult>
    getCachedView: (input: BrowseShelfInput) => Promise<ShelfBrowseResult>
    getPublicationDetails: (input: ShelfPublicationDetailsInput) => Promise<ShelfPublicationDetails>
    listSources: () => Promise<readonly ShelfSource[]>
    openReading: (input: OpenShelfReadingInput) => Promise<ShelfReadingDocument>
    prepareReading: (input: PrepareShelfReadingInput) => Promise<PreparedShelfReading>
    readReadingRange: (input: ShelfReadingRangeInput) => Promise<Uint8Array>
    refreshView: (input: BrowseShelfInput) => Promise<ShelfBrowseResult>
    removeSource: (sourceId: string) => Promise<void>
    updateSource: (input: UpdateShelfSourceInput) => Promise<ShelfSource>
  }
  window: {
    showColumnVisibilityMenu: (input: ShowDesktopColumnVisibilityMenuInput) => Promise<DesktopColumnVisibilityMenuSelection | null>
  }
}

function createDesktopLearningApi(service: DesktopServices['learning']): DesktopLearningApi {
  return {
    archiveOptimizer: optimizerId => service.archiveOptimizer(optimizerId),
    assignNoteOptimizer: input => service.assignNoteOptimizer(input),
    createOptimizer: input => service.createOptimizer(input),
    getDailyProgress: now => service.getDailyProgress(now),
    getLearningState: targetId => service.getLearningState(targetId),
    getMaintenanceEstimate: () => service.getMaintenanceEstimate(),
    getNoteOptimizer: noteId => service.getNoteOptimizer(noteId),
    getOptimizer: optimizerId => service.getOptimizer(optimizerId),
    getOptimizerNoteCount: optimizerId => service.getOptimizerNoteCount(optimizerId),
    getNextItem: input => service.getNextItem(input),
    getNextNewItem: input => service.getNextNewItem(input),
    getNextReviewItem: input => service.getNextReviewItem(input),
    listNotesWithCards: () => service.listNotesWithCards(),
    listOptimizers: () => service.listOptimizers(),
    listQueue: input => service.listQueue(input),
    listTargets: cardId => service.listTargets(cardId),
    maintainDatabase: () => service.maintainDatabase(),
    optimizeOptimizer: input => service.optimizeOptimizer(input),
    prepareReview: input => service.prepareReview(input),
    rateMultiLineCard: input => service.rateMultiLineCard(input),
    rateTarget: input => service.rateTarget(input),
    renameOptimizer: input => service.renameOptimizer(input),
    resetOptimizerDefaults: (optimizerId, rescheduleNow) => (
      service.resetOptimizerDefaults(optimizerId, rescheduleNow)
    ),
    resetTarget: input => service.resetTarget(input),
    restoreReviewItem: input => service.restoreReviewItem(input),
    undoLastReview: input => service.undoLastReview(input),
    updateOptimizer: input => service.updateOptimizer(input),
  }
}

export function createDesktopApi(
  services: DesktopServices,
  subscribeConfiguration: DesktopApi['subscribeConfiguration'],
  subscribeNoteSaveRequests: DesktopApi['subscribeNoteSaveRequests'],
  subscribeNoteUpdates: (listener: (update: DesktopNoteExternalUpdate) => void) => () => void,
): DesktopApi {
  return {
    addShelfSource: input => services.shelf.addSource(input),
    checkAssets: () => services.assets.check(),
    closeBookReadingSession: sessionId => services.books.closeReadingSession(sessionId),
    createBookContext: input => services.books.createContext(input),
    createNote: input => services.notes.createNote(input),
    deleteShelfReading: readingId => services.shelf.deleteReading(readingId),
    getCachedShelfView: input => services.shelf.getCachedView(input),
    getConfiguration: () => services.configuration.get(),
    getNote: input => services.notes.getNote(input),
    getRuntimeInfo: () => services.app.getRuntimeInfo(),
    getShelfAsset: input => services.shelf.getAsset(input),
    getShelfPublicationDetails: input => services.shelf.getPublicationDetails(input),
    getTopicBlock: input => services.notes.getTopicBlock(input),
    importNetworkImage: input => services.assets.importNetworkImage(input),
    isBookReadingAvailable: readingId => services.books.isReadingAvailable(readingId),
    listBookContexts: readingId => services.books.listContexts(readingId),
    listFavoriteNotes: input => services.notes.listFavoriteNotes(input),
    listJournalDates: input => services.journals.listJournalDates(input),
    listNotes: input => services.notes.listNotes(input),
    listPastJournals: input => services.journals.listPastJournals(input),
    listRecentNotes: input => services.notes.listRecentNotes(input),
    learning: createDesktopLearningApi(services.learning),
    listShelfSources: () => services.shelf.listSources(),
    openJournal: input => services.journals.openJournal(input),
    openMostRecentNote: () => services.notes.openMostRecentNote(),
    openShelfReading: input => services.shelf.openReading(input),
    prepareShelfReading: input => services.shelf.prepareReading(input),
    prunePastEmptyJournals: () => services.journals.prunePastEmptyJournals(),
    readShelfReadingRange: input => services.shelf.readReadingRange(input),
    reclaimAssets: input => services.assets.reclaim(input),
    rebindBookContext: input => services.books.rebindContext(input),
    recordNoteOpened: input => services.notes.recordNoteOpened(input),
    refreshShelfView: input => services.shelf.refreshView(input),
    removeShelfSource: sourceId => services.shelf.removeSource(sourceId),
    renameNote: input => services.notes.renameNote(input),
    saveImage: input => services.assets.saveImage(input),
    saveNoteUpdates: input => services.notes.saveNoteUpdates(input),
    searchNotes: input => services.notes.searchNotes(input),
    searchTopicBlocks: input => services.notes.searchTopicBlocks(input),
    setConfiguration: configuration => services.configuration.set(configuration),
    setNoteFavorite: input => services.notes.setNoteFavorite(input),
    selectBookContext: input => services.books.selectContext(input),
    showColumnVisibilityMenu: input => services.window.showColumnVisibilityMenu(input),
    subscribeConfiguration,
    subscribeNoteSaveRequests,
    subscribeNoteUpdates,
    updateShelfSource: input => services.shelf.updateSource(input),
  }
}
