import type { NoteApplicationService } from '../notes/note-application-service'
import type { DesktopIpcHandlers } from './ipc-handler-registry'

export function createJournalHandlers(
  application: NoteApplicationService,
): DesktopIpcHandlers['journals'] {
  return {
    listJournalDates(input: Parameters<NoteApplicationService['listJournalDates']>[0]) {
      return application.listJournalDates(input)
    },
    listPastJournals(input?: Parameters<NoteApplicationService['listPastJournals']>[0]) {
      return application.listPastJournals(input)
    },
    openJournal(input?: Parameters<NoteApplicationService['openJournal']>[0]) {
      return application.openJournal(input)
    },
    prunePastEmptyJournals() {
      return application.prunePastEmptyJournals()
    },
  }
}
