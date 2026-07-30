import type {
  CreateDesktopNoteInput,
  DesktopApi,
  DesktopColumnVisibilityMenuSelection,
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

export function createDesktopApi(services: DesktopServices): DesktopApi {
  return {
    createNote: input => services.notes.createNote(input),
    getNote: input => services.notes.getNote(input),
    getRuntimeInfo: () => services.app.getRuntimeInfo(),
    getTopicBlock: input => services.notes.getTopicBlock(input),
    listFavoriteNotes: input => services.notes.listFavoriteNotes(input),
    listNotes: input => services.notes.listNotes(input),
    listRecentNotes: input => services.notes.listRecentNotes(input),
    openMostRecentNote: () => services.notes.openMostRecentNote(),
    recordNoteOpened: input => services.notes.recordNoteOpened(input),
    renameNote: input => services.notes.renameNote(input),
    saveNoteUpdates: input => services.notes.saveNoteUpdates(input),
    searchNotes: input => services.notes.searchNotes(input),
    searchTopicBlocks: input => services.notes.searchTopicBlocks(input),
    setNoteFavorite: input => services.notes.setNoteFavorite(input),
    showColumnVisibilityMenu: input => services.window.showColumnVisibilityMenu(input),
  }
}
