import type {
  EditorStorage,
  FavoriteNoteItem,
  JournalDate,
  NoteSearchHit,
  RecentNoteItem,
} from '@memorilo/editor-storage'
import type { BookFileBinding, BookReadingState } from '@memorilo/reading-model'
import type { AuthoritativeNote } from './note-authoritative-cache'
import { resolveJournalTopic } from '@memorilo/editor/note'

interface ApplicationNoteDocumentBase {
  createdAt: number
  favorite: boolean
  id: string
  snapshot: Uint8Array
  title: string
  updatedAt: number
}

export interface ApplicationRegularNote extends ApplicationNoteDocumentBase {
  kind: 'regular'
}

export interface ApplicationJournalNote extends ApplicationNoteDocumentBase {
  journalDate: JournalDate
  kind: 'journal'
  topicId: string
}

export type ApplicationNoteDocument = ApplicationJournalNote | ApplicationRegularNote

export interface BookTopicReadingContext {
  book: BookFileBinding
  note: ApplicationNoteDocument
  readingState: BookReadingState
  topicId: string
  topicTitle: string
}

export function projectNoteActivity<Item extends FavoriteNoteItem | RecentNoteItem>(item: Item) {
  const { journalDate, ...base } = item
  return journalDate === undefined
    ? { ...base, kind: 'regular' as const }
    : { ...base, journalDate, kind: 'journal' as const }
}

export function projectNoteSearchHit(hit: NoteSearchHit) {
  const { journalDate, ...base } = hit
  return journalDate === undefined
    ? { ...base, noteKind: 'regular' as const }
    : { ...base, journalDate, noteKind: 'journal' as const }
}

export async function projectApplicationNote(
  storage: EditorStorage,
  current: AuthoritativeNote,
  knownFavorite?: boolean,
) {
  const favorite = knownFavorite === undefined
    ? (await storage.notes.getNoteFavorite({ noteId: current.note.id })).favorite
    : knownFavorite
  const base = {
    createdAt: current.createdAt,
    favorite,
    id: current.note.id,
    snapshot: current.note.exportSnapshot(),
    title: current.note.getTitle(),
    updatedAt: current.updatedAt,
  }
  if (current.journalDate === null)
    return { ...base, kind: 'regular' as const }
  const topic = resolveJournalTopic(current.note, { expectedNoteTitle: current.journalDate })
  return {
    ...base,
    journalDate: current.journalDate,
    kind: 'journal' as const,
    topicId: topic.topicId,
  }
}

export async function projectBookTopicReadingContext(
  storage: EditorStorage,
  current: AuthoritativeNote,
  topicId: string,
  knownFavorite?: boolean,
): Promise<BookTopicReadingContext> {
  const entry = current.note.getEntries().find(candidate => candidate.id === topicId)
  if (!entry || entry.kind !== 'topic' || entry.topicType !== 'book')
    throw new Error(`Note ${current.note.id} does not contain BookTopic ${topicId}`)
  const topic = current.note.getBookTopic(topicId)
  return {
    book: topic.getBook(),
    note: await projectApplicationNote(storage, current, knownFavorite),
    readingState: topic.getReadingState(),
    topicId,
    topicTitle: entry.title,
  }
}

export async function projectApplicationNoteSummary(
  storage: EditorStorage,
  current: AuthoritativeNote,
) {
  const { favorite } = await storage.notes.getNoteFavorite({ noteId: current.note.id })
  const base = {
    createdAt: current.createdAt,
    favorite,
    id: current.note.id,
    title: current.note.getTitle(),
    updatedAt: current.updatedAt,
  }
  return current.journalDate === null
    ? { ...base, kind: 'regular' as const }
    : { ...base, journalDate: current.journalDate, kind: 'journal' as const }
}

export function projectStoredNoteSummary(
  summary: Awaited<ReturnType<EditorStorage['notes']['listNotes']>>['items'][number],
) {
  const base = {
    createdAt: summary.createdAt,
    favorite: summary.favorite,
    id: summary.id,
    title: summary.title,
    updatedAt: summary.updatedAt,
  }
  return summary.journalDate === undefined
    ? { ...base, kind: 'regular' as const }
    : { ...base, journalDate: summary.journalDate, kind: 'journal' as const }
}
