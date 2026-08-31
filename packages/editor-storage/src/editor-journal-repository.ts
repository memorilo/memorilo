import type { DatabaseCommand, EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from './database-driver'
import type { EditorNoteRecords } from './editor-note-records'
import type {
  GetNoteInput,
  GetOrCreateJournalInput,
  JournalDate,
  JournalMetadata,
  ListJournalDatesInput,
  ListPastJournalsInput,
  PrunePastEmptyJournalsInput,
  PrunePastEmptyJournalsResult,
  StoredJournal,
  StoredJournalPage,
  StoredJournalSummary,
} from './editor-storage-contracts'
import type { LearningCardReconciliationPlanner } from './learning/learning-card-reconciliation'
import { and, asc, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm'
import { journals, noteEntries, notes, topicBlockEmbeddingState, topicBlocks } from './drizzle-schema'
import {
  assertJournalDate,
  assertNonEmpty,
  journalNoteId,
  readJournalDate,
  resolveLimit,
} from './editor-storage-shared'
import { validateCompleteLearningProjection } from './editor-storage-validation'
import { topicBlockEmbeddings } from './sqlite-extension-schema'

interface EditorJournalRepositoryOptions {
  database: EditorStorageDatabase
  planLearningCards: LearningCardReconciliationPlanner
  records: EditorNoteRecords
  runOperation: StorageOperationRunner
}

interface BlockRowId {
  row_id: number
}

interface JournalDateRow {
  journal_date: string
}

interface JournalMetadataRow {
  has_user_content: number
  journal_date: string
  note_id: string
}

interface JournalSummaryRow {
  created_at: number
  journal_date: string
  note_id: string
  note_row_id: number
  title: string
  updated_at: number
}

interface JournalEntryRow {
  entry_id: string
  kind: 'folder' | 'topic'
  note_row_id: number
  parent_entry_id: string | null
}

interface PrunableJournalRow {
  note_id: string
  note_row_id: number
}

export class EditorJournalRepository {
  readonly #orm: EditorStorageDrizzleDatabase

  constructor(private readonly options: EditorJournalRepositoryOptions) {
    this.#orm = options.database.drizzle
  }

  getOrCreate(input: GetOrCreateJournalInput): Promise<StoredJournal> {
    assertJournalDate(input.journalDate)
    if (typeof input.hasUserContent !== 'boolean')
      throw new TypeError('Journal content state must be a boolean')
    const saved = structuredClone(input)
    return this.options.runOperation(async () => {
      const existing = await this.options.records.findJournal(saved.journalDate)
      if (existing) {
        return {
          journalDate: saved.journalDate,
          note: existing,
          status: 'existing',
        }
      }

      const prepared = this.options.records.prepareInitialized({
        entries: saved.entries,
        id: journalNoteId(saved.journalDate),
        learningCards: saved.learningCards,
        snapshot: saved.snapshot,
        title: saved.journalDate,
        topics: saved.topics,
      }, Date.now(), 'journal')
      if (saved.learningCards !== undefined)
        validateCompleteLearningProjection(saved.entries, saved.learningCards)
      const learningCommands = saved.learningCards === undefined
        ? []
        : await this.options.planLearningCards({
            noteId: prepared.note.id,
            replaceMissingTopics: true,
            topics: saved.learningCards,
          })
      try {
        await this.options.database.batch([
          ...prepared.commands,
          ...learningCommands,
          {
            drizzle: (database) => {
              const note = database.select({ rowId: notes.rowId }).from(notes).where(eq(notes.id, prepared.note.id)).get()
              if (!note)
                throw new Error(`Unknown Note: ${prepared.note.id}`)
              database.insert(journals).values({
                hasUserContent: saved.hasUserContent ? 1 : 0,
                journalDate: saved.journalDate,
                noteRowId: note.rowId,
              }).run()
            },
          },
        ])
      }
      catch (error) {
        const raced = await this.options.records.findJournal(saved.journalDate)
        if (!raced)
          throw error
        return {
          journalDate: saved.journalDate,
          note: raced,
          status: 'existing',
        }
      }

      return {
        journalDate: saved.journalDate,
        note: prepared.note,
        status: 'created',
      }
    })
  }

  getMetadata(input: GetNoteInput): Promise<JournalMetadata | null> {
    assertNonEmpty(input.noteId, 'Note id')
    return this.options.runOperation(async () => {
      const row = this.#orm.select({
        note_id: notes.id,
        journal_date: journals.journalDate,
        has_user_content: journals.hasUserContent,
      }).from(notes).innerJoin(journals, eq(journals.noteRowId, notes.rowId)).where(eq(notes.id, input.noteId)).get() as JournalMetadataRow | undefined
      if (!row)
        return null
      const journalDate = readJournalDate(row.journal_date, `Stored Journal date for Note ${input.noteId}`)
      if (row.has_user_content !== 0 && row.has_user_content !== 1)
        throw new Error(`Stored Journal ${journalDate} has an invalid content state`)
      return {
        hasUserContent: row.has_user_content === 1,
        journalDate,
        noteId: row.note_id,
      }
    })
  }

  listDates(input: ListJournalDatesInput): Promise<readonly JournalDate[]> {
    assertJournalDate(input.from, 'Journal date range start')
    assertJournalDate(input.through, 'Journal date range end')
    if (input.from > input.through)
      throw new RangeError('Journal date range start must not follow its end')
    return this.options.runOperation(async () => {
      const rows = this.#orm.select({ journal_date: journals.journalDate })
        .from(journals)
        .where(and(eq(journals.hasUserContent, 1), gte(journals.journalDate, input.from), lte(journals.journalDate, input.through)))
        .orderBy(asc(journals.journalDate))
        .all() as JournalDateRow[]
      return rows.map(row => readJournalDate(row.journal_date, 'Stored Journal date'))
    })
  }

  listPast(input: ListPastJournalsInput): Promise<StoredJournalPage> {
    assertJournalDate(input.today, 'Today Journal date')
    if (input.before !== undefined)
      assertJournalDate(input.before, 'Journal page cursor')
    const limit = resolveLimit(input.limit, 20, 100)
    return this.options.runOperation(async () => {
      const rows = this.#orm.select({
        note_id: notes.id,
        note_row_id: notes.rowId,
        title: notes.title,
        created_at: notes.createdAt,
        updated_at: notes.updatedAt,
        journal_date: journals.journalDate,
      }).from(journals).innerJoin(notes, eq(notes.rowId, journals.noteRowId)).where(and(eq(journals.hasUserContent, 1), lt(journals.journalDate, input.today), input.before === undefined ? undefined : lt(journals.journalDate, input.before))).orderBy(desc(journals.journalDate)).limit(limit + 1).all() as JournalSummaryRow[]
      const hasNextPage = rows.length > limit
      const pageRows = rows.slice(0, limit)
      const entries: JournalEntryRow[] = pageRows.length === 0
        ? []
        : this.#orm.select({
          entry_id: noteEntries.entryId,
          kind: noteEntries.kind,
          note_row_id: noteEntries.noteRowId,
          parent_entry_id: noteEntries.parentEntryId,
        }).from(noteEntries).where(inArray(noteEntries.noteRowId, pageRows.map(row => row.note_row_id))).orderBy(asc(noteEntries.noteRowId), asc(noteEntries.ordinal), asc(noteEntries.rowId)).all() as JournalEntryRow[]
      const entriesByNote = new Map<number, JournalEntryRow[]>()
      for (const entry of entries) {
        const grouped = entriesByNote.get(entry.note_row_id)
        if (grouped)
          grouped.push(entry)
        else
          entriesByNote.set(entry.note_row_id, [entry])
      }
      const items = pageRows.map((row): StoredJournalSummary => {
        const journalDate = readJournalDate(row.journal_date, `Stored Journal date for Note ${row.note_id}`)
        if (row.title !== journalDate)
          throw new Error(`Journal ${journalDate} has a non-canonical stored Note title`)
        const journalEntries = entriesByNote.get(row.note_row_id) ?? []
        const rootTopic = journalEntries[0]
        if (journalEntries.length !== 1 || rootTopic?.kind !== 'topic' || rootTopic.parent_entry_id !== null)
          throw new Error(`Journal ${journalDate} does not contain exactly one root Topic`)
        return {
          createdAt: row.created_at,
          journalDate,
          noteId: row.note_id,
          title: journalDate,
          topicId: rootTopic.entry_id,
          updatedAt: row.updated_at,
        }
      })
      const lastItem = items.at(-1)
      return {
        items,
        nextCursor: hasNextPage && lastItem ? lastItem.journalDate : null,
      }
    })
  }

  prunePastEmpty(input: PrunePastEmptyJournalsInput): Promise<PrunePastEmptyJournalsResult> {
    assertJournalDate(input.before, 'Journal pruning cutoff')
    return this.options.runOperation(async () => {
      const prunableJournals = this.#orm.select({ note_id: notes.id, note_row_id: notes.rowId })
        .from(journals)
        .innerJoin(notes, eq(notes.rowId, journals.noteRowId))
        .where(and(eq(journals.hasUserContent, 0), lt(journals.journalDate, input.before)))
        .orderBy(asc(journals.journalDate))
        .all() as PrunableJournalRow[]
      if (prunableJournals.length === 0)
        return { deletedNoteIds: [] }

      const blocks = this.#orm.select({ row_id: topicBlocks.rowId })
        .from(topicBlocks)
        .innerJoin(journals, eq(journals.noteRowId, topicBlocks.noteRowId))
        .where(and(eq(journals.hasUserContent, 0), lt(journals.journalDate, input.before)))
        .all() as BlockRowId[]
      const commands: DatabaseCommand[] = blocks.flatMap(block => [
        {
          drizzle: database => database.delete(topicBlockEmbeddings)
            .where(eq(topicBlockEmbeddings.blockRowId, block.row_id))
            .run(),
        },
        {
          drizzle: database => database.delete(topicBlockEmbeddingState)
            .where(eq(topicBlockEmbeddingState.blockRowId, block.row_id))
            .run(),
        },
      ])
      for (const journal of prunableJournals) {
        commands.push({
          drizzle: database => database.delete(notes)
            .where(eq(notes.rowId, journal.note_row_id))
            .run(),
        })
      }
      await this.options.database.batch(commands)
      return { deletedNoteIds: prunableJournals.map(journal => journal.note_id) }
    })
  }
}
