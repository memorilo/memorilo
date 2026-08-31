import type { DatabaseCommand, EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from './database-driver'
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
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm'
import {
  journals,
  learningCards,
  learningNoteOptimizerAssignments,
  learningReadingItems,
  learningReviewEvents,
  learningSiblingBuryEvents,
  learningSyncOutbox,
  noteAssetReferences,
  noteFavorites,
  noteOpenHistory,
  notes,
  topicBlockEmbeddingState,
  topicBlocks,
  topics,
} from './drizzle-schema'
import {
  assertNonEmpty,
  optionalJournalDate,
  readStoredNoteJournalDate,
  resolveLimit,
} from './editor-storage-shared'
import { topicBlockEmbeddings } from './sqlite-extension-schema'

interface FavoriteNoteRow {
  favorited_at: number
  journal_date: string | null
  note_id: string
  note_title: string
  topic_row_id: number
  topic_id: string
  topic_title: string
  history_topic_id: string | null
}

interface FavoriteStateRow {
  row_id: number
}

interface NoteSummaryRow {
  created_at: number
  favorite: number | null
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
): { direction: 'asc' | 'desc', field: NoteSortField } {
  const sortBy = sortByInput ?? 'updatedAt'
  const sortDirection = sortDirectionInput ?? (sortBy === 'title' ? 'asc' : 'desc')
  const direction = (() => {
    switch (sortDirection) {
      case 'asc':
        return 'asc' as const
      case 'desc':
        return 'desc' as const
      default:
        throw new TypeError(`Unknown Note sort direction: ${String(sortDirection)}`)
    }
  })()

  if (sortBy !== 'createdAt' && sortBy !== 'title' && sortBy !== 'updatedAt')
    throw new TypeError(`Unknown Note sort field: ${String(sortBy)}`)
  return { direction, field: sortBy }
}

function visibleJournalWhere(today: string | null) {
  return today === null
    ? or(isNull(journals.noteRowId), eq(journals.hasUserContent, 1))
    : or(isNull(journals.noteRowId), eq(journals.hasUserContent, 1), eq(journals.journalDate, today))
}

/** Read model and user-library metadata for the public Note facet. */
export class EditorNoteLibrary {
  readonly #options: EditorNoteLibraryOptions
  readonly #orm: EditorStorageDrizzleDatabase

  constructor(options: EditorNoteLibraryOptions) {
    this.#options = options
    this.#orm = options.database.drizzle
  }

  readonly getNote = (input: GetNoteInput): Promise<StoredNote> => {
    assertNonEmpty(input.noteId, 'Note id')
    return this.#options.runOperation(() => this.#options.records.require(input.noteId))
  }

  readonly getNoteFavorite = (input: GetNoteInput): Promise<NoteFavoriteState> => {
    assertNonEmpty(input.noteId, 'Note id')
    return this.#options.runOperation(async () => {
      const row = this.#orm.select({ row_id: notes.rowId })
        .from(notes)
        .where(eq(notes.id, input.noteId))
        .get() as FavoriteStateRow | undefined
      if (!row)
        throw new Error(`Unknown Note: ${input.noteId}`)
      const favorite = this.#orm.select({ noteRowId: noteFavorites.noteRowId })
        .from(noteFavorites)
        .where(eq(noteFavorites.noteRowId, row.row_id))
        .get()
      return { favorite: favorite !== undefined, noteId: input.noteId }
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
      const note = this.#orm.select({ row_id: notes.rowId }).from(notes).where(eq(notes.id, input.noteId)).get()
      if (!note)
        throw new Error(`Unknown Note: ${input.noteId}`)
      const blocks = this.#orm.select({ row_id: topicBlocks.rowId }).from(topicBlocks).where(eq(topicBlocks.noteRowId, note.row_id)).all()
      const cards = this.#orm.select({ card_id: learningCards.cardId }).from(learningCards).where(eq(learningCards.noteId, input.noteId)).all()
      const commands: DatabaseCommand[] = blocks.flatMap<DatabaseCommand>(block => [
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
      commands.push(
        { drizzle: database => database.delete(learningReviewEvents).where(eq(learningReviewEvents.noteId, input.noteId)).run() },
        { drizzle: database => database.delete(learningSiblingBuryEvents).where(eq(learningSiblingBuryEvents.noteId, input.noteId)).run() },
        { drizzle: database => database.delete(learningNoteOptimizerAssignments).where(eq(learningNoteOptimizerAssignments.noteId, input.noteId)).run() },
        { drizzle: database => database.delete(learningReadingItems).where(eq(learningReadingItems.noteId, input.noteId)).run() },
        { drizzle: database => database.delete(learningCards).where(eq(learningCards.noteId, input.noteId)).run() },
        {
          drizzle: database => database.delete(learningSyncOutbox).where(and(
            eq(learningSyncOutbox.entityKind, 'assignment'),
            eq(learningSyncOutbox.entityId, input.noteId),
          )).run(),
        },
        { drizzle: database => database.delete(notes).where(eq(notes.rowId, note.row_id)).run() },
      )
      for (const card of cards) {
        commands.push({
          drizzle: database => database.delete(learningSyncOutbox).where(and(
            eq(learningSyncOutbox.entityKind, 'card'),
            eq(learningSyncOutbox.entityId, card.card_id),
          )).run(),
        })
      }
      await this.#options.database.batch(commands)
      return impact
    })
  }

  private async readDeleteNoteImpact(noteId: string): Promise<DeleteNoteImpact> {
    const note = this.#orm.select({ row_id: notes.rowId }).from(notes).where(eq(notes.id, noteId)).get()
    if (!note)
      throw new Error(`Unknown Note: ${noteId}`)
    const [topicCount, topicBlockCount, cardCount, assetReferences] = await Promise.all([
      Promise.resolve(this.#orm.select({ count: sql<number>`count(*)` }).from(topics).where(eq(topics.noteRowId, note.row_id)).get()),
      Promise.resolve(this.#orm.select({ count: sql<number>`count(*)` }).from(topicBlocks).where(eq(topicBlocks.noteRowId, note.row_id)).get()),
      Promise.resolve(this.#orm.select({ count: sql<number>`count(*)` }).from(learningCards).where(eq(learningCards.noteId, noteId)).get()),
      Promise.resolve(this.#orm.select({ asset_file_name: noteAssetReferences.assetFileName, note_row_id: noteAssetReferences.noteRowId, reference_count: noteAssetReferences.referenceCount }).from(noteAssetReferences).all()),
    ])
    if (!topicCount || !topicBlockCount || !cardCount)
      throw new Error(`Failed to inspect Note ${noteId} deletion impact`)
    const assetRowsByName = new Map<string, typeof assetReferences>()
    for (const reference of assetReferences) {
      const rows = assetRowsByName.get(reference.asset_file_name) ?? []
      rows.push(reference)
      assetRowsByName.set(reference.asset_file_name, rows)
    }
    const uniqueAssets = [...assetRowsByName.values()].filter(rows => rows.every(row => row.note_row_id === note.row_id)).length
    const ownReferences = assetReferences.filter(reference => reference.note_row_id === note.row_id)
    return {
      assetCount: uniqueAssets,
      assetReferenceCount: ownReferences.reduce((sum, reference) => sum + reference.reference_count, 0),
      cardCount: cardCount.count,
      noteId,
      topicBlockCount: topicBlockCount.count,
      topicCount: topicCount.count,
    }
  }

  readonly listFavoriteNotes = (input: ListNoteActivityInput = {}): Promise<readonly FavoriteNoteItem[]> => {
    const limit = resolveLimit(input.limit, 6, 100)
    const today = optionalJournalDate(input.today, 'Current Journal date')
    return this.#options.runOperation(async () => {
      const rows = this.#orm.select({
        favorited_at: noteFavorites.favoritedAt,
        journal_date: journals.journalDate,
        note_id: notes.id,
        note_row_id: notes.rowId,
        note_title: notes.title,
        topic_row_id: topics.rowId,
        topic_id: topics.topicId,
        topic_title: topics.title,
        history_topic_id: noteOpenHistory.topicId,
      }).from(noteFavorites).innerJoin(notes, eq(notes.rowId, noteFavorites.noteRowId)).leftJoin(journals, eq(journals.noteRowId, notes.rowId)).innerJoin(topics, eq(topics.noteRowId, notes.rowId)).leftJoin(noteOpenHistory, eq(noteOpenHistory.noteRowId, notes.rowId)).where(visibleJournalWhere(today)).orderBy(desc(noteFavorites.favoritedAt), desc(notes.id), asc(topics.rowId)).all() as Array<FavoriteNoteRow & { note_row_id: number }>
      const selected = new Map<number, FavoriteNoteRow & { note_row_id: number }>()
      for (const row of rows) {
        const current = selected.get(row.note_row_id)
        if (!current || (row.history_topic_id === row.topic_id && current.history_topic_id !== current.topic_id) || (row.history_topic_id !== row.topic_id && current.topic_row_id < row.topic_row_id))
          selected.set(row.note_row_id, row)
      }
      return [...selected.values()].slice(0, limit).map((row) => {
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
      const rows = this.#orm.select({ id: notes.id }).from(notes).orderBy(asc(notes.id)).all()
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
        Promise.resolve(this.#orm.select({ count: sql<number>`count(*)` }).from(notes).leftJoin(journals, eq(journals.noteRowId, notes.rowId)).where(visibleJournalWhere(today)).get()),
        Promise.resolve((() => {
          const query = this.#orm.select({
            id: notes.id,
            title: notes.title,
            created_at: notes.createdAt,
            updated_at: notes.updatedAt,
            journal_date: journals.journalDate,
            favorite: noteFavorites.noteRowId,
          }).from(notes).leftJoin(journals, eq(journals.noteRowId, notes.rowId)).leftJoin(noteFavorites, eq(noteFavorites.noteRowId, notes.rowId)).where(visibleJournalWhere(today))
          const ordered = orderBy.direction === 'asc'
            ? orderBy.field === 'createdAt'
              ? query.orderBy(asc(notes.createdAt), asc(notes.id))
              : orderBy.field === 'title'
                ? query.orderBy(asc(sql`lower(${notes.title})`), asc(notes.id))
                : query.orderBy(asc(notes.updatedAt), asc(notes.id))
            : orderBy.field === 'createdAt'
              ? query.orderBy(desc(notes.createdAt), desc(notes.id))
              : orderBy.field === 'title'
                ? query.orderBy(desc(sql`lower(${notes.title})`), desc(notes.id))
                : query.orderBy(desc(notes.updatedAt), desc(notes.id))
          return ordered.limit(pageSize).offset(offset).all() as NoteSummaryRow[]
        })()),
      ])
      if (!countRow)
        throw new Error('Failed to count Notes')
      return {
        items: rows.map((row) => {
          const journalDate = readStoredNoteJournalDate(row.journal_date, row.id, row.title)
          return {
            createdAt: row.created_at,
            favorite: row.favorite !== null,
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
      const rows = this.#orm.select({
        note_id: notes.id,
        note_title: notes.title,
        journal_date: journals.journalDate,
        topic_id: noteOpenHistory.topicId,
        topic_title: topics.title,
        opened_at: noteOpenHistory.openedAt,
      }).from(noteOpenHistory).innerJoin(notes, eq(notes.rowId, noteOpenHistory.noteRowId)).leftJoin(journals, eq(journals.noteRowId, notes.rowId)).innerJoin(topics, and(eq(topics.noteRowId, noteOpenHistory.noteRowId), eq(topics.topicId, noteOpenHistory.topicId))).where(visibleJournalWhere(today)).orderBy(desc(noteOpenHistory.openedAt), desc(notes.id)).limit(limit).all() as RecentNoteRow[]
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
      const topic = this.#orm.select({ note_row_id: topics.noteRowId }).from(topics).innerJoin(notes, eq(notes.rowId, topics.noteRowId)).where(and(eq(notes.id, input.noteId), eq(topics.topicId, input.topicId))).get()
      if (!topic)
        throw new Error(`Note ${input.noteId} does not contain Topic ${input.topicId}`)

      this.#orm.insert(noteOpenHistory).values({ noteRowId: topic.note_row_id, topicId: input.topicId, openedAt: Date.now() }).onConflictDoUpdate({ target: noteOpenHistory.noteRowId, set: { topicId: input.topicId, openedAt: Date.now() } }).run()
    })
  }

  readonly setNoteFavorite = (input: SetNoteFavoriteInput): Promise<NoteFavoriteState> => {
    assertNonEmpty(input.noteId, 'Note id')
    if (typeof input.favorite !== 'boolean')
      throw new TypeError('Note favorite state must be a boolean')
    return this.#options.runOperation(async () => {
      const note = this.#orm.select({ row_id: notes.rowId }).from(notes).where(eq(notes.id, input.noteId)).get()
      if (!note)
        throw new Error(`Unknown Note: ${input.noteId}`)

      if (input.favorite) {
        this.#orm.insert(noteFavorites).values({ noteRowId: note.row_id, favoritedAt: Date.now() }).onConflictDoNothing().run()
      }
      else {
        this.#orm.delete(noteFavorites).where(eq(noteFavorites.noteRowId, note.row_id)).run()
      }
      return { favorite: input.favorite, noteId: input.noteId }
    })
  }
}
