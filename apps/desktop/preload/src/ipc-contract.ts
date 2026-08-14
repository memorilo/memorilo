import type {
  AddShelfSourceInput,
  BrowseShelfInput,
  CreateDesktopBookContextResult,
  CreateDesktopNoteInput,
  DesktopAssetCheckResult,
  DesktopBookTopicContextSummary,
  DesktopColumnVisibilityMenuSelection,
  DesktopConfiguration,
  DesktopFavoriteNoteItem,
  DesktopJournalNote,
  DesktopJournalPage,
  DesktopLearningApi,
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

export interface DesktopIpcClient {
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
    setValue: (path: string, value: unknown) => Promise<DesktopConfiguration>
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

type DesktopIpcChannels = {
  readonly [Group in keyof DesktopIpcClient]: {
    readonly [Method in keyof DesktopIpcClient[Group]]: string
  }
}

export const desktopIpcChannels = {
  app: {
    getRuntimeInfo: 'memorilo:invoke:app:getRuntimeInfo',
  },
  assets: {
    check: 'memorilo:invoke:assets:check',
    importNetworkImage: 'memorilo:invoke:assets:importNetworkImage',
    reclaim: 'memorilo:invoke:assets:reclaim',
    saveImage: 'memorilo:invoke:assets:saveImage',
  },
  books: {
    closeReadingSession: 'memorilo:invoke:books:closeReadingSession',
    createContext: 'memorilo:invoke:books:createContext',
    isReadingAvailable: 'memorilo:invoke:books:isReadingAvailable',
    listContexts: 'memorilo:invoke:books:listContexts',
    rebindContext: 'memorilo:invoke:books:rebindContext',
    selectContext: 'memorilo:invoke:books:selectContext',
  },
  configuration: {
    get: 'memorilo:invoke:configuration:get',
    set: 'memorilo:invoke:configuration:set',
    setValue: 'memorilo:invoke:configuration:setValue',
  },
  journals: {
    listJournalDates: 'memorilo:invoke:journals:listJournalDates',
    listPastJournals: 'memorilo:invoke:journals:listPastJournals',
    openJournal: 'memorilo:invoke:journals:openJournal',
    prunePastEmptyJournals: 'memorilo:invoke:journals:prunePastEmptyJournals',
  },
  learning: {
    archiveOptimizer: 'memorilo:invoke:learning:archiveOptimizer',
    assignNoteOptimizer: 'memorilo:invoke:learning:assignNoteOptimizer',
    createOptimizer: 'memorilo:invoke:learning:createOptimizer',
    getActivitySummary: 'memorilo:invoke:learning:getActivitySummary',
    getDailyProgress: 'memorilo:invoke:learning:getDailyProgress',
    getLearningState: 'memorilo:invoke:learning:getLearningState',
    getMaintenanceEstimate: 'memorilo:invoke:learning:getMaintenanceEstimate',
    getNextItem: 'memorilo:invoke:learning:getNextItem',
    getNextNewItem: 'memorilo:invoke:learning:getNextNewItem',
    getNextReviewItem: 'memorilo:invoke:learning:getNextReviewItem',
    getNoteOptimizer: 'memorilo:invoke:learning:getNoteOptimizer',
    getOptimizer: 'memorilo:invoke:learning:getOptimizer',
    getOptimizerNoteCount: 'memorilo:invoke:learning:getOptimizerNoteCount',
    listNotesWithCards: 'memorilo:invoke:learning:listNotesWithCards',
    listOptimizers: 'memorilo:invoke:learning:listOptimizers',
    listQueue: 'memorilo:invoke:learning:listQueue',
    listTargets: 'memorilo:invoke:learning:listTargets',
    maintainDatabase: 'memorilo:invoke:learning:maintainDatabase',
    optimizeOptimizer: 'memorilo:invoke:learning:optimizeOptimizer',
    prepareReview: 'memorilo:invoke:learning:prepareReview',
    rateMultiLineCard: 'memorilo:invoke:learning:rateMultiLineCard',
    rateTarget: 'memorilo:invoke:learning:rateTarget',
    resetOptimizerDefaults: 'memorilo:invoke:learning:resetOptimizerDefaults',
    resetTarget: 'memorilo:invoke:learning:resetTarget',
    restoreReviewItem: 'memorilo:invoke:learning:restoreReviewItem',
    saveOptimizer: 'memorilo:invoke:learning:saveOptimizer',
    undoLastReview: 'memorilo:invoke:learning:undoLastReview',
    undoReviews: 'memorilo:invoke:learning:undoReviews',
  },
  notes: {
    createNote: 'memorilo:invoke:notes:createNote',
    getNote: 'memorilo:invoke:notes:getNote',
    getTopicBlock: 'memorilo:invoke:notes:getTopicBlock',
    listFavoriteNotes: 'memorilo:invoke:notes:listFavoriteNotes',
    listNotes: 'memorilo:invoke:notes:listNotes',
    listRecentNotes: 'memorilo:invoke:notes:listRecentNotes',
    openMostRecentNote: 'memorilo:invoke:notes:openMostRecentNote',
    recordNoteOpened: 'memorilo:invoke:notes:recordNoteOpened',
    renameNote: 'memorilo:invoke:notes:renameNote',
    saveNoteUpdates: 'memorilo:invoke:notes:saveNoteUpdates',
    searchNotes: 'memorilo:invoke:notes:searchNotes',
    searchTopicBlocks: 'memorilo:invoke:notes:searchTopicBlocks',
    setNoteFavorite: 'memorilo:invoke:notes:setNoteFavorite',
  },
  shelf: {
    addSource: 'memorilo:invoke:shelf:addSource',
    deleteReading: 'memorilo:invoke:shelf:deleteReading',
    getAsset: 'memorilo:invoke:shelf:getAsset',
    getCachedView: 'memorilo:invoke:shelf:getCachedView',
    getPublicationDetails: 'memorilo:invoke:shelf:getPublicationDetails',
    listSources: 'memorilo:invoke:shelf:listSources',
    openReading: 'memorilo:invoke:shelf:openReading',
    prepareReading: 'memorilo:invoke:shelf:prepareReading',
    readReadingRange: 'memorilo:invoke:shelf:readReadingRange',
    refreshView: 'memorilo:invoke:shelf:refreshView',
    removeSource: 'memorilo:invoke:shelf:removeSource',
    updateSource: 'memorilo:invoke:shelf:updateSource',
  },
  window: {
    showColumnVisibilityMenu: 'memorilo:invoke:window:showColumnVisibilityMenu',
  },
} as const satisfies DesktopIpcChannels
