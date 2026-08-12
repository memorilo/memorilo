import type { DatabaseValue, EditorStorageDatabase, StorageOperationRunner } from './database-driver'
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
import { EditorEmbeddingIndex } from './editor-embedding-index'
import { fuseTopicBlockSearchResults, mergeNoteSearchResults } from './editor-search-ranking'
import {
  assertNonEmpty,
  optionalJournalDate,
  readStoredNoteJournalDate,
  resolveLimit,
  visibleJournalPredicate,
} from './editor-storage-shared'

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

  constructor(
    private readonly database: EditorStorageDatabase,
    embeddingModel: EmbeddingModel,
    private readonly runOperation: StorageOperationRunner,
  ) {
    this.embeddingIndex = new EditorEmbeddingIndex(database, embeddingModel)
  }

  async getTopicBlock(input: GetTopicBlockInput): Promise<StoredTopicBlock | null> {
    return this.runOperation(async () => {
      assertNonEmpty(input.noteId, 'Note id')
      assertNonEmpty(input.topicId, 'Topic id')
      assertNonEmpty(input.blockId, 'Topic Block id')
      const row = await this.database.get<TopicBlockRow>(`
        SELECT
          n.id AS note_id,
          b.topic_id,
          b.block_id,
          b.parent_block_id,
          b.ordinal,
          b.kind,
          b.text,
          b.attributes_json,
          b.content_hash
        FROM topic_blocks b
        JOIN notes n ON n.row_id = b.note_row_id
        WHERE n.id = ? AND b.topic_id = ? AND b.block_id = ?
      `, [input.noteId, input.topicId, input.blockId])
      return row ? toStoredBlock(row) : null
    })
  }

  async indexPendingEmbeddings(input: IndexPendingEmbeddingsInput = {}): Promise<IndexPendingEmbeddingsResult> {
    return this.runOperation(() => this.embeddingIndex.indexPendingEmbeddings(input))
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
    const rows = await this.database.all<NoteTitleSearchRow>(`
      WITH visible_notes AS (
        SELECT note.*, journal.journal_date
        FROM notes AS note
        LEFT JOIN journals AS journal ON journal.note_row_id = note.row_id
        WHERE ${visibleJournalPredicate}
      )
      SELECT kind, journal_date, note_id, note_title, topic_id, topic_title, updated_at, match_position
      FROM (
        SELECT 'note' AS kind, n.journal_date, n.id AS note_id, n.title AS note_title,
          NULL AS topic_id, NULL AS topic_title, n.updated_at, instr(lower(n.title), lower(?)) AS match_position
        FROM visible_notes n
        UNION ALL
        SELECT 'topic' AS kind, n.journal_date, n.id AS note_id, n.title AS note_title,
          t.topic_id, t.title AS topic_title, n.updated_at, instr(lower(t.title), lower(?)) AS match_position
        FROM topics t JOIN visible_notes n ON n.row_id = t.note_row_id
      ) title_matches
      WHERE match_position > 0
      ORDER BY match_position ASC, CASE kind WHEN 'note' THEN 0 ELSE 1 END ASC,
        updated_at DESC, note_title COLLATE NOCASE ASC
      LIMIT ?
    `, [today, today, query, query, limit])

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
    const rows = await this.database.all<TopicSearchRow>(`
      SELECT n.id AS note_id, n.title AS note_title, journal.journal_date, n.updated_at,
        t.topic_id, t.title AS topic_title, b.block_id, b.text AS preview, b.ordinal AS rank
      FROM topic_blocks b
      JOIN topics t ON t.note_row_id = b.note_row_id AND t.topic_id = b.topic_id
      JOIN notes n ON n.row_id = b.note_row_id
      LEFT JOIN journals AS journal ON journal.note_row_id = n.row_id
      WHERE instr(lower(ltrim(b.text)), lower(?)) = 1 AND ${visibleJournalPredicate}
      ORDER BY n.updated_at DESC, t.row_id ASC, b.ordinal ASC, b.row_id ASC
      LIMIT ?
    `, [query, today, today, limit])
    return rows.map(row => toTopicSearchHit(row, 'node-start'))
  }

  private async searchTopicContent(query: string, limit: number, today: JournalDate | null): Promise<readonly TopicSearchHit[]> {
    const shortQuery = [...query].length < 3
    const rows = shortQuery
      ? await this.database.all<TopicSearchRow>(`
          SELECT n.id AS note_id, n.title AS note_title, journal.journal_date, n.updated_at,
            t.topic_id, t.title AS topic_title, b.block_id, b.text AS preview, b.ordinal AS rank
          FROM topic_blocks b
          JOIN topics t ON t.note_row_id = b.note_row_id AND t.topic_id = b.topic_id
          JOIN notes n ON n.row_id = b.note_row_id
          LEFT JOIN journals AS journal ON journal.note_row_id = n.row_id
          WHERE instr(lower(b.text), lower(?)) > 0 AND ${visibleJournalPredicate}
          ORDER BY n.updated_at DESC, t.row_id ASC, b.ordinal ASC, b.row_id ASC
          LIMIT ?
        `, [query, today, today, limit])
      : await this.database.all<TopicSearchRow>(`
          SELECT n.id AS note_id, n.title AS note_title, journal.journal_date, n.updated_at,
            t.topic_id, t.title AS topic_title, b.block_id,
            snippet(topic_blocks_fts, 0, '', '', '…', 24) AS preview, bm25(topic_blocks_fts) AS rank
          FROM topic_blocks_fts
          JOIN topic_blocks b ON b.row_id = topic_blocks_fts.rowid
          JOIN topics t ON t.note_row_id = b.note_row_id AND t.topic_id = b.topic_id
          JOIN notes n ON n.row_id = b.note_row_id
          LEFT JOIN journals AS journal ON journal.note_row_id = n.row_id
          WHERE topic_blocks_fts MATCH ? AND ${visibleJournalPredicate}
          ORDER BY rank ASC, n.updated_at DESC
          LIMIT ?
        `, [quoteFtsQuery(query), today, today, limit])
    return rows.map(row => toTopicSearchHit(row, 'content'))
  }

  private async searchTopicSemantically(query: string, limit: number, today: JournalDate | null): Promise<readonly TopicSearchHit[]> {
    const rows = await this.database.all<TopicSearchRow>(`
      SELECT n.id AS note_id, n.title AS note_title, journal.journal_date, n.updated_at,
        t.topic_id, t.title AS topic_title, b.block_id, b.text AS preview, nearest.distance AS rank
      FROM (SELECT block_row_id, distance FROM topic_block_embeddings WHERE embedding MATCH ? AND k = ?) nearest
      JOIN topic_blocks b ON b.row_id = nearest.block_row_id
      JOIN topics t ON t.note_row_id = b.note_row_id AND t.topic_id = b.topic_id
      JOIN notes n ON n.row_id = b.note_row_id
      LEFT JOIN journals AS journal ON journal.note_row_id = n.row_id
      WHERE ${visibleJournalPredicate}
      ORDER BY nearest.distance ASC, n.updated_at DESC
    `, [await this.embeddingIndex.embedQuery(query), limit, today, today])
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
    const sharedParameters: DatabaseValue[] = [noteId ?? null, noteId ?? null, today, today, limit]
    const rows = [...query].length < 3
      ? await this.database.all<TopicBlockSearchRow>(`
          SELECT n.id AS note_id, b.topic_id, b.block_id, b.parent_block_id, b.ordinal, b.kind,
            b.text, b.attributes_json, b.content_hash, b.text AS preview, 0 AS rank
          FROM topic_blocks b
          JOIN notes n ON n.row_id = b.note_row_id
          LEFT JOIN journals AS journal ON journal.note_row_id = n.row_id
          WHERE instr(lower(b.text), lower(?)) > 0 AND (? IS NULL OR n.id = ?) AND ${visibleJournalPredicate}
          ORDER BY n.updated_at DESC, b.ordinal ASC
          LIMIT ?
        `, [query, ...sharedParameters])
      : await this.database.all<TopicBlockSearchRow>(`
          SELECT n.id AS note_id, b.topic_id, b.block_id, b.parent_block_id, b.ordinal, b.kind,
            b.text, b.attributes_json, b.content_hash,
            snippet(topic_blocks_fts, 0, '', '', '…', 24) AS preview, bm25(topic_blocks_fts) AS rank
          FROM topic_blocks_fts
          JOIN topic_blocks b ON b.row_id = topic_blocks_fts.rowid
          JOIN notes n ON n.row_id = b.note_row_id
          LEFT JOIN journals AS journal ON journal.note_row_id = n.row_id
          WHERE topic_blocks_fts MATCH ? AND (? IS NULL OR n.id = ?) AND ${visibleJournalPredicate}
          ORDER BY rank ASC
          LIMIT ?
        `, [quoteFtsQuery(query), ...sharedParameters])
    return rows.map(row => ({ ...toStoredBlock(row), preview: row.preview, rank: row.rank }))
  }

  private async searchSemantically(query: string, noteId: string | undefined, limit: number, today: JournalDate | null): Promise<readonly TopicBlockSearchHit[]> {
    const vectorBytes = await this.embeddingIndex.embedQuery(query)
    let rows: readonly TopicBlockSearchRow[]
    if (noteId === undefined) {
      rows = await this.database.all<TopicBlockSearchRow>(`
        SELECT n.id AS note_id, b.topic_id, b.block_id, b.parent_block_id, b.ordinal, b.kind,
          b.text, b.attributes_json, b.content_hash, b.text AS preview, nearest.distance AS rank
        FROM (SELECT block_row_id, distance FROM topic_block_embeddings WHERE embedding MATCH ? AND k = ?) nearest
        JOIN topic_blocks b ON b.row_id = nearest.block_row_id
        JOIN notes n ON n.row_id = b.note_row_id
        LEFT JOIN journals AS journal ON journal.note_row_id = n.row_id
        WHERE ${visibleJournalPredicate}
        ORDER BY nearest.distance ASC
      `, [vectorBytes, limit, today, today])
    }
    else {
      const note = await this.database.get<{ row_id: number }>('SELECT row_id FROM notes WHERE id = ?', [noteId])
      if (!note)
        return []
      rows = await this.database.all<TopicBlockSearchRow>(`
        SELECT n.id AS note_id, b.topic_id, b.block_id, b.parent_block_id, b.ordinal, b.kind,
          b.text, b.attributes_json, b.content_hash, b.text AS preview, nearest.distance AS rank
        FROM (
          SELECT block_row_id, distance FROM topic_block_embeddings
          WHERE embedding MATCH ? AND k = ? AND note_row_id = ?
        ) nearest
        JOIN topic_blocks b ON b.row_id = nearest.block_row_id
        JOIN notes n ON n.row_id = b.note_row_id
        ORDER BY nearest.distance ASC
      `, [vectorBytes, limit, BigInt(note.row_id)])
    }
    return rows.map(row => ({ ...toStoredBlock(row), preview: row.preview, rank: row.rank }))
  }
}
