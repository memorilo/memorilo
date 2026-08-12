import type { NoteApplicationService } from '../notes/note-application-service'
import type { DesktopIpcHandlers } from './ipc-handler-registry'

export function createNoteHandlers(
  application: NoteApplicationService,
): DesktopIpcHandlers['notes'] {
  return {
    createNote(input?: Parameters<NoteApplicationService['createNote']>[0]) {
      return application.createNote(input)
    },
    getNote(input: Parameters<NoteApplicationService['getNote']>[0]) {
      return application.getNote(input)
    },
    getTopicBlock(input: Parameters<NoteApplicationService['getTopicBlock']>[0]) {
      return application.getTopicBlock(input)
    },
    listNotes(input?: Parameters<NoteApplicationService['listNotes']>[0]) {
      return application.listNotes(input)
    },
    listFavoriteNotes(input?: Parameters<NoteApplicationService['listFavoriteNotes']>[0]) {
      return application.listFavoriteNotes(input)
    },
    listRecentNotes(input?: Parameters<NoteApplicationService['listRecentNotes']>[0]) {
      return application.listRecentNotes(input)
    },
    openMostRecentNote() {
      return application.openMostRecentNote()
    },
    renameNote(input: Parameters<NoteApplicationService['renameNote']>[0]) {
      return application.renameNote(input)
    },
    saveNoteUpdates(input: Parameters<NoteApplicationService['saveNoteUpdates']>[0]) {
      return application.saveNoteUpdates(input)
    },
    searchNotes(input: Parameters<NoteApplicationService['searchNotes']>[0]) {
      return application.searchNotes(input)
    },
    searchTopicBlocks(input: Parameters<NoteApplicationService['searchTopicBlocks']>[0]) {
      return application.searchTopicBlocks(input)
    },
    recordNoteOpened(input: Parameters<NoteApplicationService['recordNoteOpened']>[0]) {
      return application.recordNoteOpened(input)
    },
    setNoteFavorite(input: Parameters<NoteApplicationService['setNoteFavorite']>[0]) {
      return application.setNoteFavorite(input)
    },
  }
}
