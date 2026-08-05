import type { NoteApplicationService } from '../notes/note-application-service'
import { IpcMethod, IpcService } from 'electron-ipc-decorator'

export function createJournalService(application: NoteApplicationService) {
  class JournalService extends IpcService {
    static override readonly groupName = 'journals'

    @IpcMethod()
    listJournalDates(input: Parameters<NoteApplicationService['listJournalDates']>[0]) {
      return application.listJournalDates(input)
    }

    @IpcMethod()
    listPastJournals(input?: Parameters<NoteApplicationService['listPastJournals']>[0]) {
      return application.listPastJournals(input)
    }

    @IpcMethod()
    openJournal(input?: Parameters<NoteApplicationService['openJournal']>[0]) {
      return application.openJournal(input)
    }

    @IpcMethod()
    prunePastEmptyJournals() {
      return application.prunePastEmptyJournals()
    }
  }

  return JournalService
}
