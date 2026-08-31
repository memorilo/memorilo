import type { SQL } from 'drizzle-orm'
import type { EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from './database-driver'
import type {
  GetTopicBlockInput,
  IndexPendingEmbeddingsInput,
  IndexPendingEmbeddingsResult,
  JournalDate,
  NoteSearchHit,
  NoteSearchMatch,
  SearchNotesInput,
  SearchTopicBlocksInput,
  StoredTopicBlock,
  TopicBlockSearchHit,
  TopicSearchHit,
} from './editor-storage-contracts'
import type { EmbeddingModel } from './embedding-model'
import { createOperationSupervisor } from '@memorilo/effect-lifecycle'
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { journals, notes, topicBlocks, topics } from './drizzle-schema'
import { EditorEmbeddingIndex } from './editor-embedding-index'
import { fuseTopicBlockSearchResults, mergeNoteSearchResults } from './editor-search-ranking'
import {
  assertNonEmpty,
  optionalJournalDate,
  readStoredNoteJournalDate,
  resolveLimit,
} from './editor-storage-shared'
import { topicBlockEmbeddings, topicBlocksFts } from './sqlite-extension-schema'

interface TopicBlockRow {
  attributes_json: string
  block_id: string
  content_hash: string
  kind: string
  note_id: string
  ordinal: number
  parent_block_id: string | null
  text: string
  topic_id: string
}

interface TopicBlockSearchRow extends TopicBlockRow {
  preview: string
  rank: number
}

interface NoteTitleSearchRow {
  journal_date: string | null
  kind: 'note' | 'topic'
  match_position: number
  note_id: string
  note_title: string
  topic_id: string | null
  topic_title: string | null
  updated_at: number
}

interface TopicSearchRow {
  block_id: string
  journal_date: string | null
  note_id: string
  note_title: string
  preview: string
  rank: number
  topic_id: string
  topic_title: string
  updated_at: number
}

interface RankedBlockCandidate {
  preview?: string
  rank: number
  row_id: number
}

function rankedVectorCandidates(rows: readonly { rank: number | null, row_id: number }[]): RankedBlockCandidate[] {
  return rows.map((row) => {
    if (row.rank === null)
      throw new Error(`sqlite-vec omitted the distance for Topic Block ${row.row_id}`)
    return { rank: row.rank, row_id: row.row_id }
  })
}

interface TopicSearchMetadataRow {
  block_id: string
  journal_date: string | null
  note_id: string
  note_title: string
  row_id: number
  text: string
  topic_id: string
  topic_title: string
  updated_at: number
}

function parseAttributes(json: string): Readonly<Record<string, unknown>> {
  const value: unknown = JSON.parse(json)
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw new TypeError('Stored Topic Block attributes must be a JSON object')
  return value as Record<string, unknown>
}

function toStoredBlock(row: TopicBlockRow): StoredTopicBlock {
  return {
    attributes: parseAttributes(row.attributes_json),
    contentHash: row.content_hash,
    id: row.block_id,
    kind: row.kind,
    noteId: row.note_id,
    ordinal: row.ordinal,
    parentId: row.parent_block_id,
    text: row.text,
    topicId: row.topic_id,
  }
}

function quoteFtsQuery(query: string): string {
  return `"${query.replaceAll('"', '""')}"`
}

function visibleJournalCondition(today: JournalDate | null): SQL | undefined {
  if (today === null)
    return undefined
  return or(
    isNull(journals.noteRowId),
    eq(journals.hasUserContent, 1),
    eq(journals.journalDate, today),
  )
}

function toTopicSearchHit(row: TopicSearchRow, match: Exclude<NoteSearchMatch, 'title'>): TopicSearchHit {
  const journalDate = readStoredNoteJournalDate(row.journal_date, row.note_id, row.note_title)
  const preview = row.preview.trim()
  return {
    blockId: row.block_id,
    ...(journalDate === undefined ? {} : { journalDate }),
    kind: 'topic',
    match,
    noteId: row.note_id,
    noteTitle: row.note_title,
    preview: preview.length > 0 ? preview : row.topic_title,
    rank: row.rank,
    topicId: row.topic_id,
    topicTitle: row.topic_title,
  }
}

export class EditorSearch {
  private readonly embeddingIndex: EditorEmbeddingIndex
  readonly #orm: EditorStorageDrizzleDatabase
  private readonly embeddingOperations = createOperationSupervisor('Editor embedding indexing', {
    closedError: () => new Error('Editor storage is closed'),
  })

  constructor(
    private readonly database: EditorStorageDatabase,
    embeddingModel: EmbeddingModel,
    private readonly runOperation: StorageOperationRunner,
  ) {
    this.#orm = database.drizzle
    this.embeddingIndex = new EditorEmbeddingIndex(database, embeddingModel, runOperation)
  }

  close(): Promise<void> {
    return this.embeddingOperations.close()
  }

  async getTopicBlock(input: GetTopicBlockInput): Promise<StoredTopicBlock | null> {
    return this.runOperation(async () => {
      assertNonEmpty(input.noteId, 'Note id')
      assertNonEmpty(input.topicId, 'Topic id')
      assertNonEmpty(input.blockId, 'Topic Block id')
      const row = this.#orm.select({
        note_id: notes.id,
        topic_id: topicBlocks.topicId,
        block_id: topicBlocks.blockId,
        parent_block_id: topicBlocks.parentBlockId,
        ordinal: topicBlocks.ordinal,
        kind: topicBlocks.kind,
        text: topicBlocks.text,
        attributes_json: topicBlocks.attributesJson,
        content_hash: topicBlocks.contentHash,
      }).from(topicBlocks).innerJoin(notes, eq(notes.rowId, topicBlocks.noteRowId)).where(and(eq(notes.id, input.noteId), eq(topicBlocks.topicId, input.topicId), eq(topicBlocks.blockId, input.blockId))).get() as TopicBlockRow | undefined
      return row ? toStoredBlock(row) : null
    })
  }

  async indexPendingEmbeddings(input: IndexPendingEmbeddingsInput = {}): Promise<IndexPendingEmbeddingsResult> {
    return this.embeddingOperations.run(() => this.embeddingIndex.indexPendingEmbeddings(input))
  }

  async searchNotes(input: SearchNotesInput): Promise<readonly NoteSearchHit[]> {
    return this.runOperation(async () => {
      const query = input.query.trim()
      if (query.length === 0)
        return []
      const limit = resolveLimit(input.limit, 20, 50)
      const today = optionalJournalDate(input.today, 'Current Journal date')
      const candidateLimit = Math.min(Math.max(limit * 4, 32), 100)
      const [titles, nodeStarts, content, semantic] = await Promise.all([
        this.searchNoteTitles(query, candidateLimit, today),
        this.searchTopicNodeStarts(query, candidateLimit, today),
        this.searchTopicContent(query, candidateLimit, today),
        this.searchTopicSemantically(query, candidateLimit, today),
      ])

      return mergeNoteSearchResults(titles, nodeStarts, content, semantic, limit)
    })
  }

  private async searchNoteTitles(query: string, limit: number, today: JournalDate | null): Promise<readonly NoteSearchHit[]> {
    const notePosition = sql<number>`instr(lower(${notes.title}), lower(${query}))`
    const topicPosition = sql<number>`instr(lower(${topics.title}), lower(${query}))`
    const noteRows = this.#orm.select({
      journal_date: journals.journalDate,
      match_position: notePosition,
      note_id: notes.id,
      note_title: notes.title,
      updated_at: notes.updatedAt,
    }).from(notes).leftJoin(journals, eq(journals.noteRowId, notes.rowId)).where(and(
      visibleJournalCondition(today),
      sql`${notePosition} > 0`,
    )).orderBy(asc(notePosition), desc(notes.updatedAt), asc(notes.title)).limit(limit).all()
    const topicRows = this.#orm.select({
      journal_date: journals.journalDate,
      match_position: topicPosition,
      note_id: notes.id,
      note_title: notes.title,
      topic_id: topics.topicId,
      topic_title: topics.title,
      updated_at: notes.updatedAt,
    }).from(topics).innerJoin(notes, eq(notes.rowId, topics.noteRowId)).leftJoin(journals, eq(journals.noteRowId, notes.rowId)).where(and(
      visibleJournalCondition(today),
      sql`${topicPosition} > 0`,
    )).orderBy(asc(topicPosition), desc(notes.updatedAt), asc(notes.title)).limit(limit).all()
    const rows: NoteTitleSearchRow[] = [
      ...noteRows.map(row => ({ ...row, kind: 'note' as const, topic_id: null, topic_title: null })),
      ...topicRows.map(row => ({ ...row, kind: 'topic' as const })),
    ].sort((left, right) => (
      left.match_position - right.match_position
      || (left.kind === right.kind ? 0 : left.kind === 'note' ? -1 : 1)
      || right.updated_at - left.updated_at
      || left.note_title.localeCompare(right.note_title, undefined, { sensitivity: 'base' })
    )).slice(0, limit)

    return rows.map((row): NoteSearchHit => {
      const journalDate = readStoredNoteJournalDate(row.journal_date, row.note_id, row.note_title)
      if (row.kind === 'note') {
        return {
          ...(journalDate === undefined ? {} : { journalDate }),
          kind: 'note',
          match: 'title',
          noteId: row.note_id,
          noteTitle: row.note_title,
          preview: row.note_title,
          rank: row.match_position,
        }
      }
      if (row.topic_id === null || row.topic_title === null)
        throw new Error(`Topic title search result for Note ${row.note_id} is missing Topic metadata`)
      return {
        blockId: null,
        ...(journalDate === undefined ? {} : { journalDate }),
        kind: 'topic',
        match: 'title',
        noteId: row.note_id,
        noteTitle: row.note_title,
        preview: row.topic_title,
        rank: row.match_position,
        topicId: row.topic_id,
        topicTitle: row.topic_title,
      }
    })
  }

  private async searchTopicNodeStarts(query: string, limit: number, today: JournalDate | null): Promise<readonly TopicSearchHit[]> {
    const rows = this.#orm.select({
      block_id: topicBlocks.blockId,
      journal_date: journals.journalDate,
      note_id: notes.id,
      note_title: notes.title,
      preview: topicBlocks.text,
      rank: topicBlocks.ordinal,
      topic_id: topics.topicId,
      topic_title: topics.title,
      updated_at: notes.updatedAt,
    }).from(topicBlocks).innerJoin(topics, and(
      eq(topics.noteRowId, topicBlocks.noteRowId),
      eq(topics.topicId, topicBlocks.topicId),
    )).innerJoin(notes, eq(notes.rowId, topicBlocks.noteRowId)).leftJoin(journals, eq(journals.noteRowId, notes.rowId)).where(and(
      sql`instr(lower(ltrim(${topicBlocks.text})), lower(${query})) = 1`,
      visibleJournalCondition(today),
    )).orderBy(desc(notes.updatedAt), asc(topics.rowId), asc(topicBlocks.ordinal), asc(topicBlocks.rowId)).limit(limit).all() as TopicSearchRow[]
    return rows.map(row => toTopicSearchHit(row, 'node-start'))
  }

  private async searchTopicContent(query: string, limit: number, today: JournalDate | null): Promise<readonly TopicSearchHit[]> {
    const shortQuery = [...query].length < 3
    const rows = shortQuery
      ? this.#orm.select({
        block_id: topicBlocks.blockId,
        journal_date: journals.journalDate,
        note_id: notes.id,
        note_title: notes.title,
        preview: topicBlocks.text,
        rank: topicBlocks.ordinal,
        topic_id: topics.topicId,
        topic_title: topics.title,
        updated_at: notes.updatedAt,
      }).from(topicBlocks).innerJoin(topics, and(
        eq(topics.noteRowId, topicBlocks.noteRowId),
        eq(topics.topicId, topicBlocks.topicId),
      )).innerJoin(notes, eq(notes.rowId, topicBlocks.noteRowId)).leftJoin(journals, eq(journals.noteRowId, notes.rowId)).where(and(
        sql`instr(lower(${topicBlocks.text}), lower(${query})) > 0`,
        visibleJournalCondition(today),
      )).orderBy(desc(notes.updatedAt), asc(topics.rowId), asc(topicBlocks.ordinal), asc(topicBlocks.rowId)).limit(limit).all() as TopicSearchRow[]
      : this.hydrateTopicSearchCandidates(
          this.#orm.select({
            row_id: topicBlocksFts.rowId,
            preview: sql<string>`snippet(${topicBlocksFts}, 0, '', '', '…', 24)`,
            rank: sql<number>`bm25(${topicBlocksFts})`,
          }).from(topicBlocksFts).where(sql`${topicBlocksFts} MATCH ${quoteFtsQuery(query)}`).orderBy(asc(sql`bm25(${topicBlocksFts})`)).limit(Math.min(limit * 4, 100)).all() as RankedBlockCandidate[],
          today,
          limit,
        )
    return rows.map(row => toTopicSearchHit(row, 'content'))
  }

  private async searchTopicSemantically(query: string, limit: number, today: JournalDate | null): Promise<readonly TopicSearchHit[]> {
    const candidates = rankedVectorCandidates(this.#orm.select({
      row_id: topicBlockEmbeddings.blockRowId,
      rank: topicBlockEmbeddings.distance,
    }).from(topicBlockEmbeddings).where(and(
      sql`${topicBlockEmbeddings.embedding} MATCH ${await this.embeddingIndex.embedQuery(query)}`,
      eq(topicBlockEmbeddings.k, Math.min(limit * 4, 100)),
    )).orderBy(asc(topicBlockEmbeddings.distance)).all())
    const rows = this.hydrateTopicSearchCandidates(candidates, today, limit)
    return rows.map(row => toTopicSearchHit(row, 'semantic'))
  }

  async searchTopicBlocks(input: SearchTopicBlocksInput): Promise<readonly TopicBlockSearchHit[]> {
    return this.runOperation(async () => {
      const query = input.query.trim()
      if (query.length === 0)
        return []
      if (input.noteId !== undefined)
        assertNonEmpty(input.noteId, 'Note id')
      const limit = resolveLimit(input.limit, 20, 100)
      const today = optionalJournalDate(input.today, 'Current Journal date')
      const discoveryToday = input.noteId === undefined ? today : null
      const mode = input.mode ?? 'hybrid'
      if (mode !== 'hybrid' && mode !== 'lexical' && mode !== 'semantic')
        throw new TypeError(`Unknown Topic Block search mode: ${mode}`)
      if (mode === 'lexical')
        return this.searchLexically(query, input.noteId, limit, discoveryToday)
      if (mode === 'semantic')
        return this.searchSemantically(query, input.noteId, limit, discoveryToday)
      const candidateLimit = Math.min(limit * 4, 100)
      const [lexical, semantic] = await Promise.all([
        this.searchLexically(query, input.noteId, candidateLimit, discoveryToday),
        this.searchSemantically(query, input.noteId, candidateLimit, discoveryToday),
      ])
      return fuseTopicBlockSearchResults(lexical, semantic, limit)
    })
  }

  private async searchLexically(query: string, noteId: string | undefined, limit: number, today: JournalDate | null): Promise<readonly TopicBlockSearchHit[]> {
    const rows = [...query].length < 3
      ? this.#orm.select({
        attributes_json: topicBlocks.attributesJson,
        block_id: topicBlocks.blockId,
        content_hash: topicBlocks.contentHash,
        kind: topicBlocks.kind,
        note_id: notes.id,
        ordinal: topicBlocks.ordinal,
        parent_block_id: topicBlocks.parentBlockId,
        preview: topicBlocks.text,
        rank: sql<number>`0`,
        text: topicBlocks.text,
        topic_id: topicBlocks.topicId,
      }).from(topicBlocks).innerJoin(notes, eq(notes.rowId, topicBlocks.noteRowId)).leftJoin(journals, eq(journals.noteRowId, notes.rowId)).where(and(
        sql`instr(lower(${topicBlocks.text}), lower(${query})) > 0`,
        noteId === undefined ? undefined : eq(notes.id, noteId),
        visibleJournalCondition(today),
      )).orderBy(desc(notes.updatedAt), asc(topicBlocks.ordinal)).limit(limit).all() as TopicBlockSearchRow[]
      : this.hydrateTopicBlockCandidates(
          this.#orm.select({
            row_id: topicBlocksFts.rowId,
            preview: sql<string>`snippet(${topicBlocksFts}, 0, '', '', '…', 24)`,
            rank: sql<number>`bm25(${topicBlocksFts})`,
          }).from(topicBlocksFts).where(sql`${topicBlocksFts} MATCH ${quoteFtsQuery(query)}`).orderBy(asc(sql`bm25(${topicBlocksFts})`)).limit(Math.min(limit * 4, 100)).all() as RankedBlockCandidate[],
          noteId,
          today,
          limit,
        )
    return rows.map(row => ({ ...toStoredBlock(row), preview: row.preview, rank: row.rank }))
  }

  private async searchSemantically(query: string, noteId: string | undefined, limit: number, today: JournalDate | null): Promise<readonly TopicBlockSearchHit[]> {
    const vectorBytes = await this.embeddingIndex.embedQuery(query)
    const note = noteId === undefined
      ? undefined
      : this.#orm.select({ row_id: notes.rowId }).from(notes).where(eq(notes.id, noteId)).get()
    if (noteId !== undefined && !note)
      return []
    const candidateLimit = Math.min(limit * 4, 100)
    const candidates = rankedVectorCandidates(this.#orm.select({
      row_id: topicBlockEmbeddings.blockRowId,
      rank: topicBlockEmbeddings.distance,
    }).from(topicBlockEmbeddings).where(and(
      sql`${topicBlockEmbeddings.embedding} MATCH ${vectorBytes}`,
      eq(topicBlockEmbeddings.k, candidateLimit),
      note === undefined ? undefined : eq(topicBlockEmbeddings.noteRowId, note.row_id),
    )).orderBy(asc(topicBlockEmbeddings.distance)).all())
    const rows = this.hydrateTopicBlockCandidates(candidates, noteId, today, limit)
    return rows.map(row => ({ ...toStoredBlock(row), preview: row.preview, rank: row.rank }))
  }

  private hydrateTopicSearchCandidates(
    candidates: readonly RankedBlockCandidate[],
    today: JournalDate | null,
    limit: number,
  ): readonly TopicSearchRow[] {
    if (candidates.length === 0)
      return []
    const rows = this.#orm.select({
      block_id: topicBlocks.blockId,
      journal_date: journals.journalDate,
      note_id: notes.id,
      note_title: notes.title,
      row_id: topicBlocks.rowId,
      text: topicBlocks.text,
      topic_id: topics.topicId,
      topic_title: topics.title,
      updated_at: notes.updatedAt,
    }).from(topicBlocks).innerJoin(topics, and(
      eq(topics.noteRowId, topicBlocks.noteRowId),
      eq(topics.topicId, topicBlocks.topicId),
    )).innerJoin(notes, eq(notes.rowId, topicBlocks.noteRowId)).leftJoin(journals, eq(journals.noteRowId, notes.rowId)).where(and(
      inArray(topicBlocks.rowId, candidates.map(candidate => candidate.row_id)),
      visibleJournalCondition(today),
    )).all() as TopicSearchMetadataRow[]
    const metadata = new Map(rows.map(row => [row.row_id, row]))
    return candidates.flatMap((candidate): TopicSearchRow[] => {
      const row = metadata.get(candidate.row_id)
      return row === undefined
        ? []
        : [{
            block_id: row.block_id,
            journal_date: row.journal_date,
            note_id: row.note_id,
            note_title: row.note_title,
            preview: candidate.preview ?? row.text,
            rank: candidate.rank,
            topic_id: row.topic_id,
            topic_title: row.topic_title,
            updated_at: row.updated_at,
          }]
    }).slice(0, limit)
  }

  private hydrateTopicBlockCandidates(
    candidates: readonly RankedBlockCandidate[],
    noteId: string | undefined,
    today: JournalDate | null,
    limit: number,
  ): readonly TopicBlockSearchRow[] {
    if (candidates.length === 0)
      return []
    const rows = this.#orm.select({
      attributes_json: topicBlocks.attributesJson,
      block_id: topicBlocks.blockId,
      content_hash: topicBlocks.contentHash,
      kind: topicBlocks.kind,
      note_id: notes.id,
      ordinal: topicBlocks.ordinal,
      parent_block_id: topicBlocks.parentBlockId,
      row_id: topicBlocks.rowId,
      text: topicBlocks.text,
      topic_id: topicBlocks.topicId,
    }).from(topicBlocks).innerJoin(notes, eq(notes.rowId, topicBlocks.noteRowId)).leftJoin(journals, eq(journals.noteRowId, notes.rowId)).where(and(
      inArray(topicBlocks.rowId, candidates.map(candidate => candidate.row_id)),
      noteId === undefined ? undefined : eq(notes.id, noteId),
      visibleJournalCondition(today),
    )).all()
    const metadata = new Map(rows.map(row => [row.row_id, row]))
    return candidates.flatMap((candidate): TopicBlockSearchRow[] => {
      const row = metadata.get(candidate.row_id)
      return row === undefined
        ? []
        : [{
            attributes_json: row.attributes_json,
            block_id: row.block_id,
            content_hash: row.content_hash,
            kind: row.kind,
            note_id: row.note_id,
            ordinal: row.ordinal,
            parent_block_id: row.parent_block_id,
            preview: candidate.preview ?? row.text,
            rank: candidate.rank,
            text: row.text,
            topic_id: row.topic_id,
          }]
    }).slice(0, limit)
  }
}
