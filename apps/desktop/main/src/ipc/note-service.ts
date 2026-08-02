import type { NoteApplicationService } from '../notes/note-application-service'
import { IpcMethod, IpcService } from 'electron-ipc-decorator'

export function createNoteService(application: NoteApplicationService) {
  class NoteService extends IpcService {
    static override readonly groupName = 'notes'

    @IpcMethod()
    createNote(input?: Parameters<NoteApplicationService['createNote']>[0]) {
      return application.createNote(input)
    }

    @IpcMethod()
    getNote(input: Parameters<NoteApplicationService['getNote']>[0]) {
      return application.getNote(input)
    }

    @IpcMethod()
    getTopicBlock(input: Parameters<NoteApplicationService['getTopicBlock']>[0]) {
      return application.getTopicBlock(input)
    }

    @IpcMethod()
    listNotes(input?: Parameters<NoteApplicationService['listNotes']>[0]) {
      return application.listNotes(input)
    }

    @IpcMethod()
    listFavoriteNotes(input?: Parameters<NoteApplicationService['listFavoriteNotes']>[0]) {
      return application.listFavoriteNotes(input)
    }

    @IpcMethod()
    listRecentNotes(input?: Parameters<NoteApplicationService['listRecentNotes']>[0]) {
      return application.listRecentNotes(input)
    }

    @IpcMethod()
    openMostRecentNote() {
      return application.openMostRecentNote()
    }

    @IpcMethod()
    renameNote(input: Parameters<NoteApplicationService['renameNote']>[0]) {
      return application.renameNote(input)
    }

    @IpcMethod()
    saveNoteUpdates(input: Parameters<NoteApplicationService['saveNoteUpdates']>[0]) {
      return application.saveNoteUpdates(input)
    }

    @IpcMethod()
    searchNotes(input: Parameters<NoteApplicationService['searchNotes']>[0]) {
      return application.searchNotes(input)
    }

    @IpcMethod()
    searchTopicBlocks(input: Parameters<NoteApplicationService['searchTopicBlocks']>[0]) {
      return application.searchTopicBlocks(input)
    }

    @IpcMethod()
    recordNoteOpened(input: Parameters<NoteApplicationService['recordNoteOpened']>[0]) {
      return application.recordNoteOpened(input)
    }

    @IpcMethod()
    setNoteFavorite(input: Parameters<NoteApplicationService['setNoteFavorite']>[0]) {
      return application.setNoteFavorite(input)
    }
  }

  return NoteService
}
