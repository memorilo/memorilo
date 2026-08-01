import type {
  CreateDesktopNoteInput,
  DesktopApi,
  DesktopColumnVisibilityMenuSelection,
  DesktopConfiguration,
  DesktopFavoriteNoteItem,
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
  ListDesktopNotesInput,
  RecordDesktopNoteOpenedInput,
  RenameDesktopNoteInput,
  RenameDesktopNoteResult,
  RuntimeInfo,
  SaveDesktopNoteUpdatesInput,
  SetDesktopNoteFavoriteInput,
  ShowDesktopColumnVisibilityMenuInput,
} from './contract'

export interface DesktopServices {
  app: {
    getRuntimeInfo: () => Promise<RuntimeInfo>
  }
  configuration: {
    get: () => Promise<DesktopConfiguration>
    set: (configuration: DesktopConfiguration) => Promise<DesktopConfiguration>
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

function createDesktopLearningApi(service: DesktopServices['learning']): DesktopLearningApi {
  return {
    archiveOptimizer: optimizerId => service.archiveOptimizer(optimizerId),
    assignNoteOptimizer: input => service.assignNoteOptimizer(input),
    createOptimizer: input => service.createOptimizer(input),
    getLearningState: targetId => service.getLearningState(targetId),
    getMaintenanceEstimate: () => service.getMaintenanceEstimate(),
    getNoteOptimizer: noteId => service.getNoteOptimizer(noteId),
    getOptimizer: optimizerId => service.getOptimizer(optimizerId),
    getOptimizerNoteCount: optimizerId => service.getOptimizerNoteCount(optimizerId),
    listOptimizers: () => service.listOptimizers(),
    listQueue: input => service.listQueue(input),
    listTargets: cardId => service.listTargets(cardId),
    maintainDatabase: () => service.maintainDatabase(),
    optimizeOptimizer: input => service.optimizeOptimizer(input),
    rateTarget: input => service.rateTarget(input),
    renameOptimizer: input => service.renameOptimizer(input),
    resetOptimizerDefaults: (optimizerId, rescheduleNow) => (
      service.resetOptimizerDefaults(optimizerId, rescheduleNow)
    ),
    resetTarget: input => service.resetTarget(input),
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
    createNote: input => services.notes.createNote(input),
    getConfiguration: () => services.configuration.get(),
    getNote: input => services.notes.getNote(input),
    getRuntimeInfo: () => services.app.getRuntimeInfo(),
    getTopicBlock: input => services.notes.getTopicBlock(input),
    listFavoriteNotes: input => services.notes.listFavoriteNotes(input),
    listNotes: input => services.notes.listNotes(input),
    listRecentNotes: input => services.notes.listRecentNotes(input),
    learning: createDesktopLearningApi(services.learning),
    openMostRecentNote: () => services.notes.openMostRecentNote(),
    recordNoteOpened: input => services.notes.recordNoteOpened(input),
    renameNote: input => services.notes.renameNote(input),
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
