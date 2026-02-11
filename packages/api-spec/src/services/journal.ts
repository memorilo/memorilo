import type { ApiError } from './common'
import type { CommandError } from './shared'
import { Effect } from 'effect'

export interface JournalCursor {
  journalAt: string
  docId: string
}

export interface JournalEntry {
  docId: string
  journalAt: string
  journalDate: string
  title: string
  typ: string
  docCreatedAt: string
  docUpdatedAt: string
}

export interface JournalPage {
  items: JournalEntry[]
  nextCursor: JournalCursor | null
}

export interface JournalHandlers {
  createJournal: (journalAt: string, title: string) => Effect.Effect<string, CommandError<ApiError | Error>>
  getJournals: (cursor: JournalCursor | null, limit: number | null) => Effect.Effect<JournalPage, CommandError<ApiError | Error>>
  getJournalsByDateRange: (startDate: string, endDate: string) => Effect.Effect<JournalEntry[], CommandError<ApiError | Error>>
  deleteJournal: (docId: string) => Effect.Effect<null, CommandError<ApiError | Error>>
}

export class JournalService extends Effect.Tag('JournalService')<JournalService, JournalHandlers>() {}
