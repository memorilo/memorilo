import type {
  DesktopApi,
  DesktopNote,
  DesktopNoteWriteReceipt,
  DesktopStoredTopicBlock,
  DesktopTopicBlockSearchHit,
  DesktopTopicBlockSearchMode,
  RuntimeInfo,
  SaveDesktopNoteUpdatesInput,
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
}

export function createDesktopApi(services: DesktopServices): DesktopApi {
  return {
    getRuntimeInfo: () => services.app.getRuntimeInfo(),
    getTopicBlock: input => services.notes.getTopicBlock(input),
    openMostRecentNote: () => services.notes.openMostRecentNote(),
    saveNoteUpdates: input => services.notes.saveNoteUpdates(input),
    searchTopicBlocks: input => services.notes.searchTopicBlocks(input),
  }
}
