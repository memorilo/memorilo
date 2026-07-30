import type {
  CreateDesktopNoteInput,
  DesktopApi,
  DesktopColumnVisibilityMenuSelection,
  DesktopNote,
  DesktopNotePage,
  DesktopNoteSearchHit,
  DesktopNoteWriteReceipt,
  DesktopStoredTopicBlock,
  DesktopTopicBlockSearchHit,
  DesktopTopicBlockSearchMode,
  GetDesktopNoteInput,
  ListDesktopNotesInput,
  RenameDesktopNoteInput,
  RenameDesktopNoteResult,
  RuntimeInfo,
  SaveDesktopNoteUpdatesInput,
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
    listNotes: (input?: ListDesktopNotesInput) => Promise<DesktopNotePage>
    openMostRecentNote: () => Promise<DesktopNote>
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
    listNotes: input => services.notes.listNotes(input),
    openMostRecentNote: () => services.notes.openMostRecentNote(),
    renameNote: input => services.notes.renameNote(input),
    saveNoteUpdates: input => services.notes.saveNoteUpdates(input),
    searchNotes: input => services.notes.searchNotes(input),
    searchTopicBlocks: input => services.notes.searchTopicBlocks(input),
    showColumnVisibilityMenu: input => services.window.showColumnVisibilityMenu(input),
  }
}
