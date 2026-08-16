import type { JournalDate, TodoRepeatRule, TodoTaskStatus } from '@memorilo/editor-storage'
import type { ReviewCardProjection } from '@memorilo/editor/card'
import type { TopicBlockEdit } from '@memorilo/editor/note'
import type { BookFileBinding } from '@memorilo/reading-model'
import type { BookTopicReadingContext } from './note-application-projection'

export type { ApplicationNoteDocument, BookTopicReadingContext } from './note-application-projection'

export interface CreateNoteInput {
  initialHeading?: string
  title?: string
}

export interface CreateBookNoteInput {
  book: BookFileBinding
  noteTitle: string
  topicTitle: string
}

export type CreateBookNoteResult
  = | { context: BookTopicReadingContext, status: 'created' }
    | { status: 'duplicate-title' }

export interface RenameNoteInput {
  noteId: string
  title: string
}

export interface OpenJournalInput {
  journalDate?: JournalDate
}

export interface ListPastJournalsInput {
  before?: JournalDate
  limit?: number
}

export interface ListJournalDatesInput {
  from: JournalDate
  through: JournalDate
}

export interface NoteApplicationServiceOptions {
  defaultNoteLearningEnabled?: () => boolean
  now?: () => Date
}

export interface ApplyTopicEditsInput {
  edits: readonly TopicBlockEdit[]
  expectedRevision: string
  noteId: string
  topicId: string
}

export interface RenameTopicInput {
  expectedRevision: string
  noteId: string
  title: string
  topicId: string
}

export interface SetTopicModeInput {
  expectedRevision: string
  mode: 0 | 1
  noteId: string
  topicId: string
}

export interface RebindBookTopicInput {
  book: BookFileBinding
  noteId: string
  topicId: string
}

export interface NoteExternalUpdate {
  noteId: string
  update: Uint8Array
  updatedAt: number
}

export interface SaveNoteUpdatesInput {
  noteId: string
  updates: readonly Uint8Array[]
}

export interface UpdateTodoTaskInput {
  blockId: string
  dueDate?: JournalDate | null
  nextDueDate?: JournalDate | null
  noteId: string
  onlyThis?: boolean
  repeatRule?: TodoRepeatRule | null
  status?: TodoTaskStatus
  text?: string
  topicId: string
}

export interface GetNoteCardProjectionInput {
  cardId: string
  noteId: string
  topicId: string
}

export interface NoteCardProjection {
  card: ReviewCardProjection
  noteTitle: string
  topicTitle: string
  updatedAt: number
}

export class NoteRevisionConflictError extends Error {
  override readonly name = 'NoteRevisionConflictError'

  constructor(readonly currentRevision: string) {
    super('The Note changed after it was read')
  }
}

export class NoteCardProjectionNotFoundError extends Error {
  override readonly name = 'NoteCardProjectionNotFoundError'

  constructor(
    readonly noteId: string,
    readonly topicId: string,
    readonly cardId: string,
  ) {
    super(`Note ${noteId} Topic ${topicId} does not contain Card ${cardId}`)
  }
}
