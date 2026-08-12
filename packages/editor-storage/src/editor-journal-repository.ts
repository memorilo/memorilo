import type { DatabaseCommand, EditorStorageDatabase, StorageOperationRunner } from './database-driver'
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
import {
  assertJournalDate,
  assertNonEmpty,
  readJournalDate,
  resolveLimit,
} from './editor-storage-shared'
import { validateCompleteLearningProjection } from './editor-storage-validation'

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
  entry_count: number
  journal_date: string
  note_id: string
  root_topic_id: string | null
  title: string
  updated_at: number
}

interface PrunableJournalRow {
  note_id: string
  note_row_id: number
}

export class EditorJournalRepository {
  constructor(private readonly options: EditorJournalRepositoryOptions) {}

  getOrCreate(input: GetOrCreateJournalInput): Promise<StoredJournal> {
    assertJournalDate(input.journalDate)
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
        id: saved.id,
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
            noteId: saved.id,
            replaceMissingTopics: true,
            topics: saved.learningCards,
          })
      try {
        await this.options.database.batch([
          ...prepared.commands,
          ...learningCommands,
          {
            parameters: [saved.journalDate, saved.id],
            sql: `
              INSERT INTO journals (note_row_id, journal_date, has_user_content)
              SELECT row_id, ?, 0 FROM notes WHERE id = ?
            `,
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
      const row = await this.options.database.get<JournalMetadataRow>(`
        SELECT
          note.id AS note_id,
          journal.journal_date,
          journal.has_user_content
        FROM notes AS note
        INNER JOIN journals AS journal ON journal.note_row_id = note.row_id
        WHERE note.id = ?
      `, [input.noteId])
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
      const rows = await this.options.database.all<JournalDateRow>(`
        SELECT journal_date
        FROM journals
        WHERE journal_date >= ?
          AND journal_date <= ?
          AND has_user_content = 1
        ORDER BY journal_date ASC
      `, [input.from, input.through])
      return rows.map(row => readJournalDate(row.journal_date, 'Stored Journal date'))
    })
  }

  listPast(input: ListPastJournalsInput): Promise<StoredJournalPage> {
    assertJournalDate(input.today, 'Today Journal date')
    if (input.before !== undefined)
      assertJournalDate(input.before, 'Journal page cursor')
    const limit = resolveLimit(input.limit, 20, 100)
    return this.options.runOperation(async () => {
      const rows = await this.options.database.all<JournalSummaryRow>(`
        SELECT
          note.id AS note_id,
          note.title,
          note.created_at,
          note.updated_at,
          journal.journal_date,
          (
            SELECT COUNT(*)
            FROM note_entries AS entry
            WHERE entry.note_row_id = note.row_id
          ) AS entry_count,
          (
            SELECT entry.entry_id
            FROM note_entries AS entry
            WHERE entry.note_row_id = note.row_id
              AND entry.kind = 'topic'
              AND entry.parent_entry_id IS NULL
            ORDER BY entry.ordinal ASC, entry.row_id ASC
            LIMIT 1
          ) AS root_topic_id
        FROM journals AS journal
        INNER JOIN notes AS note ON note.row_id = journal.note_row_id
        WHERE journal.has_user_content = 1
          AND journal.journal_date < ?
          AND (? IS NULL OR journal.journal_date < ?)
        ORDER BY journal.journal_date DESC
        LIMIT ?
      `, [input.today, input.before ?? null, input.before ?? null, limit + 1])
      const hasNextPage = rows.length > limit
      const pageRows = rows.slice(0, limit)
      const items = pageRows.map((row): StoredJournalSummary => {
        const journalDate = readJournalDate(row.journal_date, `Stored Journal date for Note ${row.note_id}`)
        if (row.title !== journalDate)
          throw new Error(`Journal ${journalDate} has a non-canonical stored Note title`)
        if (row.entry_count !== 1 || row.root_topic_id === null)
          throw new Error(`Journal ${journalDate} does not contain exactly one root Topic`)
        return {
          createdAt: row.created_at,
          journalDate,
          noteId: row.note_id,
          title: journalDate,
          topicId: row.root_topic_id,
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
      const journals = await this.options.database.all<PrunableJournalRow>(`
        SELECT note.id AS note_id, note.row_id AS note_row_id
        FROM journals AS journal
        INNER JOIN notes AS note ON note.row_id = journal.note_row_id
        WHERE journal.journal_date < ? AND journal.has_user_content = 0
        ORDER BY journal.journal_date ASC
      `, [input.before])
      if (journals.length === 0)
        return { deletedNoteIds: [] }

      const blocks = await this.options.database.all<BlockRowId>(`
        SELECT block.row_id
        FROM topic_blocks AS block
        INNER JOIN journals AS journal ON journal.note_row_id = block.note_row_id
        WHERE journal.journal_date < ? AND journal.has_user_content = 0
      `, [input.before])
      const commands: DatabaseCommand[] = blocks.flatMap(block => [
        {
          parameters: [block.row_id],
          sql: 'DELETE FROM topic_block_embeddings WHERE block_row_id = ?',
        },
        {
          parameters: [block.row_id],
          sql: 'DELETE FROM topic_block_embedding_state WHERE block_row_id = ?',
        },
      ])
      for (const journal of journals) {
        commands.push({
          parameters: [journal.note_row_id, input.before],
          sql: `
            DELETE FROM notes
            WHERE row_id = ?
              AND EXISTS (
                SELECT 1
                FROM journals
                WHERE note_row_id = notes.row_id
                  AND journal_date < ?
                  AND has_user_content = 0
              )
          `,
        })
      }
      await this.options.database.batch(commands)
      return { deletedNoteIds: journals.map(journal => journal.note_id) }
    })
  }
}
