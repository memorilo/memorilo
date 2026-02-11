import type { JournalHandlers } from '@memorilo/api-spec/services/journal'
import { wrapCommand } from './shared'

export const journalHandlers: JournalHandlers = {
  createJournal: wrapCommand('createJournal'),
  getJournals: wrapCommand('getJournals'),
  getJournalsByDateRange: wrapCommand('getJournalsByDateRange'),
  deleteJournal: wrapCommand('deleteJournal'),
}
