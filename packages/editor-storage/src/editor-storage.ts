import type { DatabaseCommand, DatabaseValue, EditorStorageDatabase } from './database-driver'
import type { EmbeddingModel } from './embedding-model'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { v7 as createUuidV7 } from 'uuid'

export interface FolderProjection {
  id: string
  kind: 'folder'
  name: string
  ordinal: number
  parentId: string | null
}

export type TopicEditorMode = 0 | 1

export interface TopicProjection {
  id: string
  kind: 'topic'
  mode: TopicEditorMode
  ordinal: number
  parentId: string | null
  title: string
}

export type NoteEntryProjection = FolderProjection | TopicProjection

export interface TopicBlockProjection {
  attributes: Readonly<Record<string, unknown>>
  id: string
  kind: string
  ordinal: number
  parentId: string | null
  text: string
}

export interface TopicContentProjection {
  blocks: readonly TopicBlockProjection[]
  topicId: string
}

export interface StoredNoteUpdate {
  sequence: number
  update: Uint8Array
}

export interface StoredNote {
  checkpointSequence: number
  id: string
  latestSequence: number
  snapshot: Uint8Array | null
  title: string
  updatedAt: number
  updates: readonly StoredNoteUpdate[]
}

export interface SaveNoteUpdatesInput {
  entries?: readonly NoteEntryProjection[]
  noteId: string
  title?: string
  topics: readonly TopicContentProjection[]
  updates: readonly Uint8Array[]
}

export interface CheckpointNoteInput {
  noteId: string
  snapshot: Uint8Array
  throughSequence: number
}

export interface NoteWriteReceipt {
  latestSequence: number
  updatedAt: number
}

export interface GetTopicBlockInput {
  blockId: string
  noteId: string
  topicId: string
}

export type TopicBlockSearchMode = 'hybrid' | 'lexical' | 'semantic'

export interface SearchTopicBlocksInput {
  limit?: number
  mode?: TopicBlockSearchMode
  noteId?: string
  query: string
}

export interface IndexPendingEmbeddingsInput {
  limit?: number
  noteId?: string
}

export interface StoredTopicBlock extends TopicBlockProjection {
  contentHash: string
  noteId: string
  topicId: string
}

export interface TopicBlockSearchHit extends StoredTopicBlock {
  preview: string
  rank: number
}

export interface EditorStorage {
  checkpointNote: (input: CheckpointNoteInput) => Promise<NoteWriteReceipt>
  close: () => Promise<void>
  getTopicBlock: (input: GetTopicBlockInput) => Promise<StoredTopicBlock | null>
  indexPendingEmbeddings: (input?: IndexPendingEmbeddingsInput) => Promise<number>
  openMostRecentNote: () => Promise<StoredNote>
  saveNoteUpdates: (input: SaveNoteUpdatesInput) => Promise<NoteWriteReceipt>
  searchTopicBlocks: (input: SearchTopicBlocksInput) => Promise<readonly TopicBlockSearchHit[]>
}

export interface CreateEditorStorageOptions {
  database: EditorStorageDatabase
  embeddingModel: EmbeddingModel
}

interface NoteRow {
  checkpoint_sequence: number
  checkpoint_snapshot: Uint8Array | null
  id: string
  latest_sequence: number
  row_id: number
  title: string
  updated_at: number
}

interface NoteUpdateRow {
  sequence: number
  update_blob: Uint8Array
}

interface NoteUpdateHashRow {
  update_hash: string
}

interface ExistingEntryRow {
  entry_id: string
}

interface ExistingTopicRow {
  topic_id: string
}

interface ExistingBlockRow {
  block_id: string
  content_hash: string
  row_id: number
  topic_id: string
}

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

interface PendingEmbeddingRow {
  content_hash: string
  note_row_id: number
  row_id: number
  text: string
}

interface EmbeddingConfigurationRow {
  dimensions: number
  model_id: string
}

const schema = `
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS notes (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    checkpoint_snapshot BLOB,
    checkpoint_sequence INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint_sequence >= 0),
    latest_sequence INTEGER NOT NULL DEFAULT 0 CHECK (latest_sequence >= checkpoint_sequence),
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS note_updates (
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    update_hash TEXT NOT NULL,
    update_blob BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (note_row_id, sequence),
    UNIQUE (note_row_id, update_hash)
  );

  CREATE TABLE IF NOT EXISTS note_update_receipts (
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    update_hash TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (note_row_id, update_hash)
  );

  CREATE TABLE IF NOT EXISTS note_entries (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    entry_id TEXT NOT NULL,
    parent_entry_id TEXT,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('folder', 'topic')),
    label TEXT NOT NULL,
    UNIQUE (note_row_id, entry_id)
  );

  CREATE INDEX IF NOT EXISTS note_entries_parent_order_idx
    ON note_entries(note_row_id, parent_entry_id, ordinal);

  CREATE TABLE IF NOT EXISTS topics (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL,
    editor_mode INTEGER NOT NULL CHECK (editor_mode IN (0, 1)),
    title TEXT NOT NULL,
    UNIQUE (note_row_id, topic_id)
  );

  CREATE TABLE IF NOT EXISTS topic_blocks (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL,
    block_id TEXT NOT NULL,
    parent_block_id TEXT,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    attributes_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    UNIQUE (note_row_id, topic_id, block_id),
    FOREIGN KEY (note_row_id, topic_id)
      REFERENCES topics(note_row_id, topic_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS topic_blocks_parent_order_idx
    ON topic_blocks(note_row_id, topic_id, parent_block_id, ordinal);

  CREATE VIRTUAL TABLE IF NOT EXISTS topic_blocks_fts USING fts5(
    text,
    content='topic_blocks',
    content_rowid='row_id',
    tokenize='trigram'
  );

  CREATE TRIGGER IF NOT EXISTS topic_blocks_fts_insert
  AFTER INSERT ON topic_blocks BEGIN
    INSERT INTO topic_blocks_fts(rowid, text) VALUES (new.row_id, new.text);
  END;

  CREATE TRIGGER IF NOT EXISTS topic_blocks_fts_delete
  AFTER DELETE ON topic_blocks BEGIN
    INSERT INTO topic_blocks_fts(topic_blocks_fts, rowid, text)
      VALUES ('delete', old.row_id, old.text);
  END;

  CREATE TRIGGER IF NOT EXISTS topic_blocks_fts_update
  AFTER UPDATE OF text ON topic_blocks BEGIN
    INSERT INTO topic_blocks_fts(topic_blocks_fts, rowid, text)
      VALUES ('delete', old.row_id, old.text);
    INSERT INTO topic_blocks_fts(rowid, text) VALUES (new.row_id, new.text);
  END;

  CREATE TABLE IF NOT EXISTS editor_storage_embedding_configuration (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    model_id TEXT NOT NULL,
    dimensions INTEGER NOT NULL CHECK (dimensions > 0)
  );

  CREATE TABLE IF NOT EXISTS topic_block_embedding_state (
    block_row_id INTEGER PRIMARY KEY REFERENCES topic_blocks(row_id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    content_hash TEXT NOT NULL
  );
`

function vectorSchema(dimensions: number): string {
  return `
    CREATE VIRTUAL TABLE IF NOT EXISTS topic_block_embeddings USING vec0(
      block_row_id INTEGER PRIMARY KEY,
      note_row_id INTEGER PARTITION KEY,
      embedding FLOAT[${dimensions}]
    );
  `
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
}

function validateBinary(value: Uint8Array, name: string): void {
  if (!(value instanceof Uint8Array) || value.byteLength === 0)
    throw new TypeError(`${name} must be a non-empty Uint8Array`)
}

function validateEmbeddingModel(model: EmbeddingModel): void {
  assertNonEmpty(model.id, 'Embedding model id')
  if (!Number.isInteger(model.dimensions) || model.dimensions < 1)
    throw new RangeError('Embedding model dimensions must be a positive integer')
}

function validateHierarchy<T extends { id: string, ordinal: number, parentId: string | null }>(
  values: readonly T[],
  description: string,
): Map<string, T> {
  const byId = new Map<string, T>()
  const siblingPositions = new Set<string>()

  for (const value of values) {
    assertNonEmpty(value.id, `${description} id`)
    if (!Number.isInteger(value.ordinal) || value.ordinal < 0)
      throw new RangeError(`${description} ${value.id} ordinal must be a non-negative integer`)
    if (byId.has(value.id))
      throw new Error(`Duplicate ${description} id: ${value.id}`)
    if (value.parentId === value.id)
      throw new Error(`${description} ${value.id} cannot be its own parent`)

    byId.set(value.id, value)
    const position = `${value.parentId ?? '<root>'}\0${value.ordinal}`
    if (siblingPositions.has(position))
      throw new Error(`Duplicate ${description} ordinal ${value.ordinal} under ${value.parentId ?? '<root>'}`)
    siblingPositions.add(position)
  }

  for (const value of values) {
    const ancestors = new Set<string>([value.id])
    let parentId = value.parentId
    while (parentId !== null) {
      if (ancestors.has(parentId))
        throw new Error(`${description} ${value.id} belongs to a parent cycle`)
      ancestors.add(parentId)
      const parent = byId.get(parentId)
      if (!parent)
        throw new Error(`${description} ${value.id} has unknown parent ${parentId}`)
      parentId = parent.parentId
    }
  }
  return byId
}

function validateProjectionPatch(
  entries: readonly NoteEntryProjection[] | undefined,
  topics: readonly TopicContentProjection[],
): void {
  const entriesById = entries ? validateHierarchy(entries, 'NoteEntry') : undefined
  const topicEntries = new Map<string, TopicProjection>()

  for (const entry of entries ?? []) {
    if (entry.kind === 'folder') {
      assertNonEmpty(entry.name, `Folder ${entry.id} name`)
    }
    else if (entry.kind === 'topic') {
      assertNonEmpty(entry.title, `Topic ${entry.id} title`)
      if (entry.mode !== 0 && entry.mode !== 1)
        throw new TypeError(`Topic ${entry.id} Editor mode must be 0 (Document) or 1 (Outline)`)
      topicEntries.set(entry.id, entry)
    }
    else {
      throw new TypeError(`Unknown NoteEntry kind: ${String((entry as { kind: unknown }).kind)}`)
    }
  }

  const projectedTopics = new Set<string>()
  for (const topic of topics) {
    assertNonEmpty(topic.topicId, 'Topic projection id')
    if (projectedTopics.has(topic.topicId))
      throw new Error(`Duplicate Topic projection: ${topic.topicId}`)
    projectedTopics.add(topic.topicId)
    const entry = topicEntries.get(topic.topicId)
    if (entries && !entry)
      throw new Error(`Topic projection ${topic.topicId} has no matching NoteEntry`)

    validateHierarchy(topic.blocks, `Topic ${topic.topicId} Block`)
    for (const block of topic.blocks) {
      assertNonEmpty(block.kind, `Topic ${topic.topicId} Block ${block.id} kind`)
      if (block.attributes === null || Array.isArray(block.attributes) || typeof block.attributes !== 'object')
        throw new TypeError(`Topic ${topic.topicId} Block ${block.id} attributes must be an object`)
    }
  }

  for (const entry of entries ?? []) {
    if (entry.parentId !== null && !entriesById?.has(entry.parentId))
      throw new Error(`NoteEntry ${entry.id} has unknown parent ${entry.parentId}`)
    if (entry.kind === 'topic' && entry.parentId !== null && entriesById?.get(entry.parentId)?.kind === 'folder')
      throw new Error(`Topic ${entry.id} cannot use Folder ${entry.parentId} as its parent`)
  }
}

function contentHash(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)))
}

function updateHash(update: Uint8Array): string {
  return bytesToHex(sha256(update))
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

function resolveLimit(limit: number | undefined, fallback: number, maximum: number): number {
  const resolved = limit ?? fallback
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum)
    throw new RangeError(`Limit must be an integer between 1 and ${maximum}`)
  return resolved
}

function validateVector(vector: Float32Array, model: EmbeddingModel): void {
  if (vector.length !== model.dimensions)
    throw new RangeError(`Embedding model ${model.id} returned ${vector.length} dimensions; expected ${model.dimensions}`)
  for (const value of vector) {
    if (!Number.isFinite(value))
      throw new TypeError(`Embedding model ${model.id} returned a non-finite value`)
  }
}

function serializeVector(vector: Float32Array): Uint8Array {
  return new Uint8Array(new Float32Array(vector).buffer)
}

function blockKey(block: Pick<StoredTopicBlock, 'id' | 'noteId' | 'topicId'>): string {
  return `${block.noteId}\0${block.topicId}\0${block.id}`
}

function fuseSearchResults(
  lexical: readonly TopicBlockSearchHit[],
  semantic: readonly TopicBlockSearchHit[],
  limit: number,
): readonly TopicBlockSearchHit[] {
  const candidates = new Map<string, { hit: TopicBlockSearchHit, score: number }>()
  const add = (hits: readonly TopicBlockSearchHit[]) => {
    for (const [index, hit] of hits.entries()) {
      const key = blockKey(hit)
      const score = 1 / (61 + index)
      const existing = candidates.get(key)
      if (existing) {
        existing.score += score
        if (hit.preview !== hit.text)
          existing.hit = hit
      }
      else {
        candidates.set(key, { hit, score })
      }
    }
  }

  add(lexical)
  add(semantic)
  return [...candidates.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(candidate => ({ ...candidate.hit, rank: -candidate.score }))
}

class DefaultEditorStorage implements EditorStorage {
  readonly #database: EditorStorageDatabase
  readonly #embeddingModel: EmbeddingModel
  #writeQueue: Promise<void> = Promise.resolve()

  private constructor(options: CreateEditorStorageOptions) {
    this.#database = options.database
    this.#embeddingModel = options.embeddingModel
  }

  static async create(options: CreateEditorStorageOptions): Promise<DefaultEditorStorage> {
    validateEmbeddingModel(options.embeddingModel)
    await options.database.exec(schema)

    const configuration = await options.database.get<EmbeddingConfigurationRow>(`
      SELECT model_id, dimensions
      FROM editor_storage_embedding_configuration
      WHERE singleton = 1
    `)
    if (configuration && (
      configuration.model_id !== options.embeddingModel.id
      || configuration.dimensions !== options.embeddingModel.dimensions
    )) {
      await options.database.batch([
        { sql: 'DROP TABLE IF EXISTS topic_block_embeddings' },
        { sql: 'DELETE FROM topic_block_embedding_state' },
        {
          parameters: [options.embeddingModel.id, options.embeddingModel.dimensions],
          sql: `
            UPDATE editor_storage_embedding_configuration
            SET model_id = ?, dimensions = ?
            WHERE singleton = 1
          `,
        },
      ])
    }

    await options.database.exec(vectorSchema(options.embeddingModel.dimensions))
    await options.database.run(`
      INSERT INTO editor_storage_embedding_configuration (singleton, model_id, dimensions)
      VALUES (1, ?, ?)
      ON CONFLICT(singleton) DO NOTHING
    `, [options.embeddingModel.id, options.embeddingModel.dimensions])
    return new DefaultEditorStorage(options)
  }

  async #serializeWrite<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#writeQueue.then(operation)
    this.#writeQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async close(): Promise<void> {
    await this.#writeQueue
    await this.#database.close()
  }

  async openMostRecentNote(): Promise<StoredNote> {
    return this.#serializeWrite(async () => {
      let note = await this.#database.get<NoteRow>(`
        SELECT
          row_id,
          id,
          title,
          checkpoint_snapshot,
          checkpoint_sequence,
          latest_sequence,
          updated_at
        FROM notes
        ORDER BY updated_at DESC, row_id DESC
        LIMIT 1
      `)

      if (!note) {
        const now = Date.now()
        const id = createUuidV7()
        await this.#database.run(`
          INSERT INTO notes (id, title, checkpoint_snapshot, checkpoint_sequence, latest_sequence, updated_at)
          VALUES (?, ?, NULL, 0, 0, ?)
        `, [id, 'Untitled', now])
        note = {
          checkpoint_sequence: 0,
          checkpoint_snapshot: null,
          id,
          latest_sequence: 0,
          row_id: -1,
          title: 'Untitled',
          updated_at: now,
        }
      }

      const updates = note.latest_sequence === note.checkpoint_sequence
        ? []
        : await this.#database.all<NoteUpdateRow>(`
            SELECT sequence, update_blob
            FROM note_updates
            WHERE note_row_id = (
              SELECT row_id FROM notes WHERE id = ?
            ) AND sequence > ?
            ORDER BY sequence ASC
          `, [note.id, note.checkpoint_sequence])

      return {
        checkpointSequence: note.checkpoint_sequence,
        id: note.id,
        latestSequence: note.latest_sequence,
        snapshot: note.checkpoint_snapshot === null ? null : new Uint8Array(note.checkpoint_snapshot),
        title: note.title,
        updatedAt: note.updated_at,
        updates: updates.map(update => ({
          sequence: update.sequence,
          update: new Uint8Array(update.update_blob),
        })),
      }
    })
  }

  async saveNoteUpdates(input: SaveNoteUpdatesInput): Promise<NoteWriteReceipt> {
    assertNonEmpty(input.noteId, 'Note id')
    if (input.title !== undefined)
      assertNonEmpty(input.title, 'Note title')
    if (input.updates.length === 0)
      throw new TypeError('Note updates must contain at least one update')
    input.updates.forEach((update, index) => validateBinary(update, `Note update ${index}`))
    validateProjectionPatch(input.entries, input.topics)
    const saved = structuredClone(input)

    return this.#serializeWrite(async () => {
      const note = await this.#database.get<NoteRow>(`
        SELECT
          row_id,
          id,
          title,
          checkpoint_snapshot,
          checkpoint_sequence,
          latest_sequence,
          updated_at
        FROM notes
        WHERE id = ?
      `, [saved.noteId])
      if (!note)
        throw new Error(`Unknown Note: ${saved.noteId}`)

      const updatesByHash = new Map(saved.updates.map(update => [updateHash(update), update]))
      const received = await this.#database.all<NoteUpdateHashRow>(
        'SELECT update_hash FROM note_update_receipts WHERE note_row_id = ?',
        [note.row_id],
      )
      const receivedHashes = new Set(received.map(row => row.update_hash))
      const newUpdates = [...updatesByHash]
        .filter(([hash]) => !receivedHashes.has(hash))
        .map(([hash, update]) => ({ hash, update }))
      if (newUpdates.length === 0)
        return { latestSequence: note.latest_sequence, updatedAt: note.updated_at }

      const [existingEntries, existingTopics, existingBlocksByTopic] = await Promise.all([
        saved.entries
          ? this.#database.all<ExistingEntryRow>(
              'SELECT entry_id FROM note_entries WHERE note_row_id = ?',
              [note.row_id],
            )
          : Promise.resolve([]),
        saved.entries
          ? this.#database.all<ExistingTopicRow>(
              'SELECT topic_id FROM topics WHERE note_row_id = ?',
              [note.row_id],
            )
          : Promise.resolve([]),
        Promise.all(saved.topics.map(topic => this.#database.all<ExistingBlockRow>(`
          SELECT row_id, topic_id, block_id, content_hash
          FROM topic_blocks
          WHERE note_row_id = ? AND topic_id = ?
        `, [note.row_id, topic.topicId]))),
      ])

      const existingBlocks = existingBlocksByTopic.flat()
      const nextEntries = new Map((saved.entries ?? []).map(entry => [entry.id, entry]))
      const nextTopics = new Map((saved.entries ?? [])
        .filter((entry): entry is TopicProjection => entry.kind === 'topic')
        .map(entry => [entry.id, entry]))
      const nextBlocks = new Map<string, {
        block: TopicBlockProjection
        hash: string
        topicId: string
      }>()
      for (const topic of saved.topics) {
        for (const block of topic.blocks) {
          nextBlocks.set(`${topic.topicId}\0${block.id}`, {
            block,
            hash: contentHash(block.text),
            topicId: topic.topicId,
          })
        }
      }

      const commands: DatabaseCommand[] = []
      for (const existing of existingBlocks) {
        const next = nextBlocks.get(`${existing.topic_id}\0${existing.block_id}`)
        if (!next || next.hash !== existing.content_hash) {
          commands.push(
            { parameters: [existing.row_id], sql: 'DELETE FROM topic_block_embeddings WHERE block_row_id = ?' },
            { parameters: [existing.row_id], sql: 'DELETE FROM topic_block_embedding_state WHERE block_row_id = ?' },
          )
        }
      }

      const now = Date.now()
      const latestSequence = note.latest_sequence + newUpdates.length
      commands.push({
        parameters: [saved.title ?? note.title, latestSequence, now, note.row_id],
        sql: `
          UPDATE notes
          SET title = ?, latest_sequence = ?, updated_at = ?
          WHERE row_id = ?
        `,
      })
      newUpdates.forEach(({ hash, update }, index) => {
        const sequence = note.latest_sequence + index + 1
        commands.push({
          parameters: [note.row_id, sequence, hash, update, now],
          sql: `
            INSERT INTO note_updates (note_row_id, sequence, update_hash, update_blob, created_at)
            VALUES (?, ?, ?, ?, ?)
          `,
        })
        commands.push({
          parameters: [note.row_id, hash, sequence, now],
          sql: `
            INSERT INTO note_update_receipts (note_row_id, update_hash, sequence, created_at)
            VALUES (?, ?, ?, ?)
          `,
        })
      })

      for (const entry of saved.entries ?? []) {
        commands.push({
          parameters: [
            note.row_id,
            entry.id,
            entry.parentId,
            entry.ordinal,
            entry.kind,
            entry.kind === 'folder' ? entry.name : entry.title,
          ],
          sql: `
            INSERT INTO note_entries (
              note_row_id, entry_id, parent_entry_id, ordinal, kind, label
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(note_row_id, entry_id) DO UPDATE SET
              parent_entry_id = excluded.parent_entry_id,
              ordinal = excluded.ordinal,
              kind = excluded.kind,
              label = excluded.label
          `,
        })
      }

      for (const entry of nextTopics.values()) {
        commands.push({
          parameters: [note.row_id, entry.id, entry.mode, entry.title],
          sql: `
            INSERT INTO topics (note_row_id, topic_id, editor_mode, title)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(note_row_id, topic_id) DO UPDATE SET
              editor_mode = excluded.editor_mode,
              title = excluded.title
          `,
        })
      }

      for (const next of nextBlocks.values()) {
        commands.push({
          parameters: [
            note.row_id,
            next.topicId,
            next.block.id,
            next.block.parentId,
            next.block.ordinal,
            next.block.kind,
            next.block.text,
            JSON.stringify(next.block.attributes),
            next.hash,
          ],
          sql: `
            INSERT INTO topic_blocks (
              note_row_id,
              topic_id,
              block_id,
              parent_block_id,
              ordinal,
              kind,
              text,
              attributes_json,
              content_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(note_row_id, topic_id, block_id) DO UPDATE SET
              parent_block_id = excluded.parent_block_id,
              ordinal = excluded.ordinal,
              kind = excluded.kind,
              text = excluded.text,
              attributes_json = excluded.attributes_json,
              content_hash = excluded.content_hash
          `,
        })
      }

      for (const existing of existingBlocks) {
        if (!nextBlocks.has(`${existing.topic_id}\0${existing.block_id}`)) {
          commands.push({
            parameters: [note.row_id, existing.topic_id, existing.block_id],
            sql: 'DELETE FROM topic_blocks WHERE note_row_id = ? AND topic_id = ? AND block_id = ?',
          })
        }
      }
      for (const existing of existingTopics) {
        if (!nextTopics.has(existing.topic_id)) {
          commands.push({
            parameters: [note.row_id, existing.topic_id],
            sql: 'DELETE FROM topics WHERE note_row_id = ? AND topic_id = ?',
          })
        }
      }
      for (const existing of existingEntries) {
        if (!nextEntries.has(existing.entry_id)) {
          commands.push({
            parameters: [note.row_id, existing.entry_id],
            sql: 'DELETE FROM note_entries WHERE note_row_id = ? AND entry_id = ?',
          })
        }
      }

      await this.#database.batch(commands)
      return { latestSequence, updatedAt: now }
    })
  }

  async checkpointNote(input: CheckpointNoteInput): Promise<NoteWriteReceipt> {
    assertNonEmpty(input.noteId, 'Note id')
    validateBinary(input.snapshot, 'Note checkpoint snapshot')
    if (!Number.isInteger(input.throughSequence) || input.throughSequence < 0)
      throw new RangeError('Note checkpoint sequence must be a non-negative integer')
    const saved = structuredClone(input)

    return this.#serializeWrite(async () => {
      const note = await this.#database.get<NoteRow>(`
        SELECT
          row_id,
          id,
          title,
          checkpoint_snapshot,
          checkpoint_sequence,
          latest_sequence,
          updated_at
        FROM notes
        WHERE id = ?
      `, [saved.noteId])
      if (!note)
        throw new Error(`Unknown Note: ${saved.noteId}`)
      if (saved.throughSequence < note.checkpoint_sequence || saved.throughSequence > note.latest_sequence) {
        throw new RangeError(
          `Note checkpoint sequence ${saved.throughSequence} is outside ${note.checkpoint_sequence}..${note.latest_sequence}`,
        )
      }

      const now = Date.now()
      await this.#database.batch([
        {
          parameters: [saved.snapshot, saved.throughSequence, now, note.row_id],
          sql: `
            UPDATE notes
            SET checkpoint_snapshot = ?, checkpoint_sequence = ?, updated_at = ?
            WHERE row_id = ?
          `,
        },
        {
          parameters: [note.row_id, saved.throughSequence],
          sql: 'DELETE FROM note_updates WHERE note_row_id = ? AND sequence <= ?',
        },
      ])
      return { latestSequence: note.latest_sequence, updatedAt: now }
    })
  }

  async getTopicBlock(input: GetTopicBlockInput): Promise<StoredTopicBlock | null> {
    assertNonEmpty(input.noteId, 'Note id')
    assertNonEmpty(input.topicId, 'Topic id')
    assertNonEmpty(input.blockId, 'Topic Block id')
    const row = await this.#database.get<TopicBlockRow>(`
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
  }

  async indexPendingEmbeddings(input: IndexPendingEmbeddingsInput = {}): Promise<number> {
    if (input.noteId !== undefined)
      assertNonEmpty(input.noteId, 'Note id')
    const limit = resolveLimit(input.limit, 32, 256)
    return this.#serializeWrite(async () => {
      const rows = await this.#database.all<PendingEmbeddingRow>(`
        SELECT
          b.row_id,
          b.note_row_id,
          b.text,
          b.content_hash
        FROM topic_blocks b
        JOIN notes n ON n.row_id = b.note_row_id
        LEFT JOIN topic_block_embedding_state s ON s.block_row_id = b.row_id
        WHERE (s.block_row_id IS NULL OR s.model_id <> ? OR s.content_hash <> b.content_hash)
          AND (? IS NULL OR n.id = ?)
        ORDER BY n.updated_at DESC, b.row_id ASC
        LIMIT ?
      `, [this.#embeddingModel.id, input.noteId ?? null, input.noteId ?? null, limit])
      if (rows.length === 0)
        return 0

      const vectors = await this.#embeddingModel.embedDocuments(rows.map(row => row.text))
      if (vectors.length !== rows.length)
        throw new Error(`Embedding model ${this.#embeddingModel.id} returned ${vectors.length} vectors for ${rows.length} Topic Blocks`)

      const commands: DatabaseCommand[] = []
      for (const [index, row] of rows.entries()) {
        const vector = vectors[index]
        if (!vector)
          throw new Error(`Embedding model ${this.#embeddingModel.id} omitted vector ${index}`)
        validateVector(vector, this.#embeddingModel)
        commands.push(
          {
            parameters: [
              BigInt(row.row_id),
              BigInt(row.note_row_id),
              serializeVector(vector),
              row.row_id,
              row.content_hash,
            ],
            sql: `
              INSERT OR REPLACE INTO topic_block_embeddings (block_row_id, note_row_id, embedding)
              SELECT ?, ?, ?
              WHERE EXISTS (
                SELECT 1 FROM topic_blocks WHERE row_id = ? AND content_hash = ?
              )
            `,
          },
          {
            parameters: [
              row.row_id,
              this.#embeddingModel.id,
              row.content_hash,
              row.row_id,
              row.content_hash,
            ],
            sql: `
              INSERT INTO topic_block_embedding_state (block_row_id, model_id, content_hash)
              SELECT ?, ?, ?
              WHERE EXISTS (
                SELECT 1 FROM topic_blocks WHERE row_id = ? AND content_hash = ?
              )
              ON CONFLICT(block_row_id) DO UPDATE SET
                model_id = excluded.model_id,
                content_hash = excluded.content_hash
            `,
          },
        )
      }
      await this.#database.batch(commands)
      return rows.length
    })
  }

  async searchTopicBlocks(input: SearchTopicBlocksInput): Promise<readonly TopicBlockSearchHit[]> {
    const query = input.query.trim()
    if (query.length === 0)
      return []
    if (input.noteId !== undefined)
      assertNonEmpty(input.noteId, 'Note id')
    const limit = resolveLimit(input.limit, 20, 100)
    const mode = input.mode ?? 'hybrid'
    if (mode !== 'hybrid' && mode !== 'lexical' && mode !== 'semantic')
      throw new TypeError(`Unknown Topic Block search mode: ${mode}`)

    if (mode === 'lexical')
      return this.#searchLexically(query, input.noteId, limit)
    if (mode === 'semantic')
      return this.#searchSemantically(query, input.noteId, limit)

    const candidateLimit = Math.min(limit * 4, 100)
    const [lexical, semantic] = await Promise.all([
      this.#searchLexically(query, input.noteId, candidateLimit),
      this.#searchSemantically(query, input.noteId, candidateLimit),
    ])
    return fuseSearchResults(lexical, semantic, limit)
  }

  async #searchLexically(
    query: string,
    noteId: string | undefined,
    limit: number,
  ): Promise<readonly TopicBlockSearchHit[]> {
    let rows: readonly TopicBlockSearchRow[]
    const sharedParameters: DatabaseValue[] = [noteId ?? null, noteId ?? null, limit]
    if ([...query].length < 3) {
      rows = await this.#database.all<TopicBlockSearchRow>(`
        SELECT
          n.id AS note_id,
          b.topic_id,
          b.block_id,
          b.parent_block_id,
          b.ordinal,
          b.kind,
          b.text,
          b.attributes_json,
          b.content_hash,
          b.text AS preview,
          0 AS rank
        FROM topic_blocks b
        JOIN notes n ON n.row_id = b.note_row_id
        WHERE instr(lower(b.text), lower(?)) > 0
          AND (? IS NULL OR n.id = ?)
        ORDER BY n.updated_at DESC, b.ordinal ASC
        LIMIT ?
      `, [query, ...sharedParameters])
    }
    else {
      rows = await this.#database.all<TopicBlockSearchRow>(`
        SELECT
          n.id AS note_id,
          b.topic_id,
          b.block_id,
          b.parent_block_id,
          b.ordinal,
          b.kind,
          b.text,
          b.attributes_json,
          b.content_hash,
          snippet(topic_blocks_fts, 0, '', '', '…', 24) AS preview,
          bm25(topic_blocks_fts) AS rank
        FROM topic_blocks_fts
        JOIN topic_blocks b ON b.row_id = topic_blocks_fts.rowid
        JOIN notes n ON n.row_id = b.note_row_id
        WHERE topic_blocks_fts MATCH ?
          AND (? IS NULL OR n.id = ?)
        ORDER BY rank ASC
        LIMIT ?
      `, [quoteFtsQuery(query), ...sharedParameters])
    }
    return rows.map(row => ({ ...toStoredBlock(row), preview: row.preview, rank: row.rank }))
  }

  async #searchSemantically(
    query: string,
    noteId: string | undefined,
    limit: number,
  ): Promise<readonly TopicBlockSearchHit[]> {
    const vector = await this.#embeddingModel.embedQuery(query)
    validateVector(vector, this.#embeddingModel)
    const vectorBytes = serializeVector(vector)

    let rows: readonly TopicBlockSearchRow[]
    if (noteId === undefined) {
      rows = await this.#database.all<TopicBlockSearchRow>(`
        SELECT
          n.id AS note_id,
          b.topic_id,
          b.block_id,
          b.parent_block_id,
          b.ordinal,
          b.kind,
          b.text,
          b.attributes_json,
          b.content_hash,
          b.text AS preview,
          nearest.distance AS rank
        FROM (
          SELECT block_row_id, distance
          FROM topic_block_embeddings
          WHERE embedding MATCH ? AND k = ?
        ) nearest
        JOIN topic_blocks b ON b.row_id = nearest.block_row_id
        JOIN notes n ON n.row_id = b.note_row_id
        ORDER BY nearest.distance ASC
      `, [vectorBytes, limit])
    }
    else {
      const note = await this.#database.get<{ row_id: number }>(
        'SELECT row_id FROM notes WHERE id = ?',
        [noteId],
      )
      if (!note)
        return []
      rows = await this.#database.all<TopicBlockSearchRow>(`
        SELECT
          n.id AS note_id,
          b.topic_id,
          b.block_id,
          b.parent_block_id,
          b.ordinal,
          b.kind,
          b.text,
          b.attributes_json,
          b.content_hash,
          b.text AS preview,
          nearest.distance AS rank
        FROM (
          SELECT block_row_id, distance
          FROM topic_block_embeddings
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

export async function createEditorStorage(options: CreateEditorStorageOptions): Promise<EditorStorage> {
  return DefaultEditorStorage.create(options)
}
