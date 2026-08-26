import type { DatabaseCommand, EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import type { EditorNoteRecords } from './editor-note-records'
import type {
  DeleteNoteImpact,
  FavoriteNoteItem,
  GetNoteInput,
  ListNoteActivityInput,
  ListNotesInput,
  NoteFavoriteState,
  NotePage,
  NoteSortDirection,
  NoteSortField,
  OpenMostRecentNoteInput,
  RecentNoteItem,
  RecordNoteOpenedInput,
  SetNoteFavoriteInput,
  StoredNote,
} from './editor-storage-contracts'
import {
  assertNonEmpty,
  optionalJournalDate,
  readStoredNoteJournalDate,
  resolveLimit,
  visibleJournalPredicate,
} from './editor-storage-shared'

interface CountRow {
  count: number
}

interface FavoriteNoteRow {
  favorited_at: number
  journal_date: string | null
  note_id: string
  note_title: string
  topic_id: string
  topic_title: string
}

interface FavoriteStateRow {
  favorite: number
}

interface NoteSummaryRow {
  created_at: number
  favorite: number
  id: string
  journal_date: string | null
  title: string
  updated_at: number
}

interface RecentNoteRow {
  journal_date: string | null
  note_id: string
  note_title: string
  opened_at: number
  topic_id: string
  topic_title: string
}

interface EditorNoteLibraryOptions {
  database: EditorStorageDatabase
  records: EditorNoteRecords
  runOperation: StorageOperationRunner
}

function resolvePage(page: number | undefined): number {
  const resolved = page ?? 1
  if (!Number.isInteger(resolved) || resolved < 1)
    throw new RangeError('Page must be a positive integer')
  return resolved
}

function resolveNoteOrderBy(
  sortByInput: NoteSortField | undefined,
  sortDirectionInput: NoteSortDirection | undefined,
): string {
  const sortBy = sortByInput ?? 'updatedAt'
  const sortDirection = sortDirectionInput ?? (sortBy === 'title' ? 'asc' : 'desc')
  const direction = (() => {
    switch (sortDirection) {
      case 'asc':
        return 'ASC'
      case 'desc':
        return 'DESC'
      default:
        throw new TypeError(`Unknown Note sort direction: ${String(sortDirection)}`)
    }
  })()

  switch (sortBy) {
    case 'createdAt':
      return `created_at ${direction}, id ${direction}`
    case 'title':
      return `title COLLATE NOCASE ${direction}, id ${direction}`
    case 'updatedAt':
      return `updated_at ${direction}, id ${direction}`
    default:
      throw new TypeError(`Unknown Note sort field: ${String(sortBy)}`)
  }
}

/** Read model and user-library metadata for the public Note facet. */
export class EditorNoteLibrary {
  readonly #options: EditorNoteLibraryOptions

  constructor(options: EditorNoteLibraryOptions) {
    this.#options = options
  }

  readonly getNote = (input: GetNoteInput): Promise<StoredNote> => {
    assertNonEmpty(input.noteId, 'Note id')
    return this.#options.runOperation(() => this.#options.records.require(input.noteId))
  }

  readonly getNoteFavorite = (input: GetNoteInput): Promise<NoteFavoriteState> => {
    assertNonEmpty(input.noteId, 'Note id')
    return this.#options.runOperation(async () => {
      const row = await this.#options.database.get<FavoriteStateRow>(`
        SELECT EXISTS(
          SELECT 1
          FROM note_favorites AS favorite
          WHERE favorite.note_row_id = note.row_id
        ) AS favorite
        FROM notes AS note
        WHERE note.id = ?
      `, [input.noteId])
      if (!row)
        throw new Error(`Unknown Note: ${input.noteId}`)
      return { favorite: row.favorite === 1, noteId: input.noteId }
    })
  }

  readonly getDeleteNoteImpact = (input: GetNoteInput): Promise<DeleteNoteImpact> => {
    assertNonEmpty(input.noteId, 'Note id')
    return this.#options.runOperation(() => this.readDeleteNoteImpact(input.noteId))
  }

  readonly deleteNote = (input: GetNoteInput): Promise<DeleteNoteImpact> => {
    assertNonEmpty(input.noteId, 'Note id')
    return this.#options.runOperation(async () => {
      const impact = await this.readDeleteNoteImpact(input.noteId)
      const note = await this.#options.database.get<{ row_id: number }>('SELECT row_id FROM notes WHERE id = ?', [input.noteId])
      if (!note)
        throw new Error(`Unknown Note: ${input.noteId}`)
      const blocks = await this.#options.database.all<{ row_id: number }>('SELECT row_id FROM topic_blocks WHERE note_row_id = ?', [note.row_id])
      const cards = await this.#options.database.all<{ card_id: string }>('SELECT card_id FROM learning_cards WHERE note_id = ?', [input.noteId])
      const commands: DatabaseCommand[] = blocks.flatMap<DatabaseCommand>(block => [
        { parameters: [block.row_id], sql: 'DELETE FROM topic_block_embeddings WHERE block_row_id = ?' },
        { parameters: [block.row_id], sql: 'DELETE FROM topic_block_embedding_state WHERE block_row_id = ?' },
      ])
      commands.push(
        { parameters: [input.noteId], sql: 'DELETE FROM learning_review_events WHERE note_id = ?' },
        { parameters: [input.noteId], sql: 'DELETE FROM learning_sibling_bury_events WHERE note_id = ?' },
        { parameters: [input.noteId], sql: 'DELETE FROM learning_note_optimizer_assignments WHERE note_id = ?' },
        { parameters: [input.noteId], sql: 'DELETE FROM learning_reading_items WHERE note_id = ?' },
        { parameters: [input.noteId], sql: 'DELETE FROM learning_cards WHERE note_id = ?' },
        { parameters: [input.noteId], sql: 'DELETE FROM learning_sync_outbox WHERE entity_kind = \'assignment\' AND entity_id = ?' },
        { parameters: [note.row_id], sql: 'DELETE FROM notes WHERE row_id = ?' },
      )
      for (const card of cards)
        commands.push({ parameters: [card.card_id], sql: 'DELETE FROM learning_sync_outbox WHERE entity_kind = \'card\' AND entity_id = ?' })
      await this.#options.database.batch(commands)
      return impact
    })
  }

  private async readDeleteNoteImpact(noteId: string): Promise<DeleteNoteImpact> {
    const row = await this.#options.database.get<{
      asset_count: number
      asset_reference_count: number
      card_count: number
      note_row_id: number
      topic_block_count: number
      topic_count: number
    }>(`
      SELECT
        note.row_id AS note_row_id,
        (SELECT COUNT(*) FROM topics WHERE note_row_id = note.row_id) AS topic_count,
        (SELECT COUNT(*) FROM topic_blocks WHERE note_row_id = note.row_id) AS topic_block_count,
        (SELECT COUNT(*) FROM learning_cards WHERE note_id = note.id) AS card_count,
        (SELECT COALESCE(SUM(reference_count), 0) FROM note_asset_references WHERE note_row_id = note.row_id) AS asset_reference_count,
        (SELECT COUNT(*) FROM note_asset_references AS refs WHERE refs.note_row_id = note.row_id AND NOT EXISTS (SELECT 1 FROM note_asset_references AS other WHERE other.asset_file_name = refs.asset_file_name AND other.note_row_id <> refs.note_row_id)) AS asset_count
      FROM notes AS note
      WHERE note.id = ?
    `, [noteId])
    if (!row)
      throw new Error(`Unknown Note: ${noteId}`)
    return {
      assetCount: row.asset_count,
      assetReferenceCount: row.asset_reference_count,
      cardCount: row.card_count,
      noteId,
      topicBlockCount: row.topic_block_count,
      topicCount: row.topic_count,
    }
  }

  readonly listFavoriteNotes = (input: ListNoteActivityInput = {}): Promise<readonly FavoriteNoteItem[]> => {
    const limit = resolveLimit(input.limit, 6, 100)
    const today = optionalJournalDate(input.today, 'Current Journal date')
    return this.#options.runOperation(async () => {
      const rows = await this.#options.database.all<FavoriteNoteRow>(`
        WITH first_topics AS (
          SELECT
            note_row_id,
            topic_id,
            title,
            ROW_NUMBER() OVER (PARTITION BY note_row_id ORDER BY row_id ASC) AS position
          FROM topics
        )
        SELECT
          note.id AS note_id,
          note.title AS note_title,
          journal.journal_date,
          COALESCE(history.topic_id, first_topic.topic_id) AS topic_id,
          COALESCE(history_topic.title, first_topic.title) AS topic_title,
          favorite.favorited_at
        FROM note_favorites AS favorite
        INNER JOIN notes AS note ON note.row_id = favorite.note_row_id
        LEFT JOIN journals AS journal ON journal.note_row_id = note.row_id
        INNER JOIN first_topics AS first_topic
          ON first_topic.note_row_id = note.row_id AND first_topic.position = 1
        LEFT JOIN note_open_history AS history ON history.note_row_id = note.row_id
        LEFT JOIN topics AS history_topic
          ON history_topic.note_row_id = note.row_id AND history_topic.topic_id = history.topic_id
        WHERE ${visibleJournalPredicate}
        ORDER BY favorite.favorited_at DESC, note.id DESC
        LIMIT ?
      `, [today, today, limit])
      return rows.map((row) => {
        const journalDate = readStoredNoteJournalDate(row.journal_date, row.note_id, row.note_title)
        return {
          favoritedAt: row.favorited_at,
          ...(journalDate === undefined ? {} : { journalDate }),
          noteId: row.note_id,
          noteTitle: row.note_title,
          topicId: row.topic_id,
          topicTitle: row.topic_title,
        }
      })
    })
  }

  readonly listNoteIds = (): Promise<readonly string[]> => {
    return this.#options.runOperation(async () => {
      const rows = await this.#options.database.all<{ id: string }>('SELECT id FROM notes ORDER BY id ASC')
      return rows.map(row => row.id)
    })
  }

  readonly listNotes = (input: ListNotesInput = {}): Promise<NotePage> => {
    const page = resolvePage(input.page)
    const pageSize = resolveLimit(input.pageSize, 50, 100)
    const orderBy = resolveNoteOrderBy(input.sortBy, input.sortDirection)
    const today = optionalJournalDate(input.today, 'Current Journal date')
    const offset = (page - 1) * pageSize
    if (!Number.isSafeInteger(offset))
      throw new RangeError('Page offset exceeds the safe integer range')

    return this.#options.runOperation(async () => {
      const [countRow, rows] = await Promise.all([
        this.#options.database.get<CountRow>(`
          SELECT COUNT(*) AS count
          FROM notes AS note
          LEFT JOIN journals AS journal ON journal.note_row_id = note.row_id
          WHERE ${visibleJournalPredicate}
        `, [today, today]),
        this.#options.database.all<NoteSummaryRow>(`
          SELECT
            note.id,
            note.title,
            note.created_at,
            note.updated_at,
            journal.journal_date,
            EXISTS(
              SELECT 1
              FROM note_favorites AS favorite
              WHERE favorite.note_row_id = note.row_id
            ) AS favorite
          FROM notes AS note
          LEFT JOIN journals AS journal ON journal.note_row_id = note.row_id
          WHERE ${visibleJournalPredicate}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?
        `, [today, today, pageSize, offset]),
      ])
      if (!countRow)
        throw new Error('Failed to count Notes')
      return {
        items: rows.map((row) => {
          const journalDate = readStoredNoteJournalDate(row.journal_date, row.id, row.title)
          return {
            createdAt: row.created_at,
            favorite: row.favorite === 1,
            id: row.id,
            ...(journalDate === undefined ? {} : { journalDate }),
            title: row.title,
            updatedAt: row.updated_at,
          }
        }),
        page,
        pageSize,
        totalItems: countRow.count,
        totalPages: Math.ceil(countRow.count / pageSize),
      }
    })
  }

  readonly listRecentNotes = (input: ListNoteActivityInput = {}): Promise<readonly RecentNoteItem[]> => {
    const limit = resolveLimit(input.limit, 6, 100)
    const today = optionalJournalDate(input.today, 'Current Journal date')
    return this.#options.runOperation(async () => {
      const rows = await this.#options.database.all<RecentNoteRow>(`
        SELECT
          note.id AS note_id,
          note.title AS note_title,
          journal.journal_date,
          history.topic_id,
          topic.title AS topic_title,
          history.opened_at
        FROM note_open_history AS history
        INNER JOIN notes AS note ON note.row_id = history.note_row_id
        LEFT JOIN journals AS journal ON journal.note_row_id = note.row_id
        INNER JOIN topics AS topic
          ON topic.note_row_id = history.note_row_id AND topic.topic_id = history.topic_id
        WHERE ${visibleJournalPredicate}
        ORDER BY history.opened_at DESC, note.id DESC
        LIMIT ?
      `, [today, today, limit])
      return rows.map((row) => {
        const journalDate = readStoredNoteJournalDate(row.journal_date, row.note_id, row.note_title)
        return {
          ...(journalDate === undefined ? {} : { journalDate }),
          noteId: row.note_id,
          noteTitle: row.note_title,
          openedAt: row.opened_at,
          topicId: row.topic_id,
          topicTitle: row.topic_title,
        }
      })
    })
  }

  readonly openMostRecentNote = (input: OpenMostRecentNoteInput = {}): Promise<StoredNote> => {
    const today = optionalJournalDate(input.today, 'Current Journal date')
    return this.#options.runOperation(() => this.#options.records.openMostRecent(today))
  }

  readonly recordNoteOpened = (input: RecordNoteOpenedInput): Promise<void> => {
    assertNonEmpty(input.noteId, 'Note id')
    assertNonEmpty(input.topicId, 'Topic id')
    return this.#options.runOperation(async () => {
      const topic = await this.#options.database.get<{ note_row_id: number }>(`
        SELECT topic.note_row_id
        FROM topics AS topic
        INNER JOIN notes AS note ON note.row_id = topic.note_row_id
        WHERE note.id = ? AND topic.topic_id = ?
      `, [input.noteId, input.topicId])
      if (!topic)
        throw new Error(`Note ${input.noteId} does not contain Topic ${input.topicId}`)

      await this.#options.database.run(`
        INSERT INTO note_open_history (note_row_id, topic_id, opened_at)
        VALUES (?, ?, ?)
        ON CONFLICT(note_row_id) DO UPDATE SET
          topic_id = excluded.topic_id,
          opened_at = excluded.opened_at
      `, [topic.note_row_id, input.topicId, Date.now()])
    })
  }

  readonly setNoteFavorite = (input: SetNoteFavoriteInput): Promise<NoteFavoriteState> => {
    assertNonEmpty(input.noteId, 'Note id')
    if (typeof input.favorite !== 'boolean')
      throw new TypeError('Note favorite state must be a boolean')
    return this.#options.runOperation(async () => {
      const note = await this.#options.database.get<{ row_id: number }>(
        'SELECT row_id FROM notes WHERE id = ?',
        [input.noteId],
      )
      if (!note)
        throw new Error(`Unknown Note: ${input.noteId}`)

      if (input.favorite) {
        await this.#options.database.run(`
          INSERT INTO note_favorites (note_row_id, favorited_at)
          VALUES (?, ?)
          ON CONFLICT(note_row_id) DO NOTHING
        `, [note.row_id, Date.now()])
      }
      else {
        await this.#options.database.run(
          'DELETE FROM note_favorites WHERE note_row_id = ?',
          [note.row_id],
        )
      }
      return { favorite: input.favorite, noteId: input.noteId }
    })
  }
}
