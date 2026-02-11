import type { EffectJournalCommands } from '@memorilo/api-spec/command'
import { wrapCommand } from './shared'

export const effectJournalCommands: EffectJournalCommands = {
  createJournal: wrapCommand('createJournal'),
  getJournals: wrapCommand('getJournals'),
  getJournalsByDateRange: wrapCommand('getJournalsByDateRange'),
  deleteJournal: wrapCommand('deleteJournal'),
}
