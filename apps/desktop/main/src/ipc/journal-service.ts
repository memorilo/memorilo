import type { DesktopRequestHandlers } from '../desktop-request-handlers'
import type { NoteApplicationService } from '../notes/note-application-service'

export function createJournalHandlers(
  application: NoteApplicationService,
): DesktopRequestHandlers['journals'] {
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
