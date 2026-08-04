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
  title: string
  topicId: string
}

export interface StoredNoteUpdate {
  sequence: number
  update: Uint8Array
}

export interface StoredNote {
  checkpointSequence: number
  createdAt: number
  id: string
  latestSequence: number
  snapshot: Uint8Array | null
  title: string
  updatedAt: number
  updates: readonly StoredNoteUpdate[]
}

export interface CreateNoteInput {
  title?: string
}

export class DuplicateNoteTitleError extends Error {
  override readonly name = 'DuplicateNoteTitleError'

  constructor(readonly title: string) {
    super(`A Note named "${title}" already exists`)
  }
}

export interface GetNoteInput {
  noteId: string
}

export interface ListNotesInput {
  page?: number
  pageSize?: number
  sortBy?: NoteSortField
  sortDirection?: NoteSortDirection
}

export type NoteSortDirection = 'asc' | 'desc'

export type NoteSortField = 'createdAt' | 'title' | 'updatedAt'

export interface NoteSummary {
  createdAt: number
  favorite: boolean
  id: string
  title: string
  updatedAt: number
}

export interface ListNoteActivityInput {
  limit?: number
}

export interface NoteFavoriteState {
  favorite: boolean
  noteId: string
}

export type SetNoteFavoriteInput = NoteFavoriteState

export interface RecordNoteOpenedInput {
  noteId: string
  topicId: string
}

export interface FavoriteNoteItem {
  favoritedAt: number
  noteId: string
  noteTitle: string
  topicId: string
  topicTitle: string
}

export interface RecentNoteItem {
  noteId: string
  noteTitle: string
  openedAt: number
  topicId: string
  topicTitle: string
}

export interface NotePage {
  items: readonly NoteSummary[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface AssetReferenceProjection {
  count: number
  fileName: string
}

export interface AssetStatistics {
  managedAssetCount: number
  referenceCount: number
}

export interface StoredAsset {
  byteSize: number
  createdAt: number
  fileName: string
  mimeType: string
  originalFileName: string
}

export interface RegisterAssetInput {
  byteSize: number
  createdAt?: number
  fileName: string
  mimeType: string
  originalFileName: string
}

export interface ReconcileNoteAssetReferencesInput {
  allowedMissingAssetFileNames?: readonly string[]
  expectedLatestSequence: number
  noteId: string
  references: readonly AssetReferenceProjection[]
}

export interface SaveNoteUpdatesInput {
  allowedMissingAssetFileNames?: readonly string[]
  assetReferences?: readonly AssetReferenceProjection[]
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
  acceptedUpdateHashes: readonly string[]
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

export interface SearchNotesInput {
  limit?: number
  query: string
}

export type NoteSearchMatch = 'content' | 'node-start' | 'semantic' | 'title'

export interface NoteTitleSearchHit {
  kind: 'note'
  match: 'title'
  noteId: string
  noteTitle: string
  preview: string
  rank: number
}

export interface TopicSearchHit {
  blockId: string | null
  kind: 'topic'
  match: NoteSearchMatch
  noteId: string
  noteTitle: string
  preview: string
  rank: number
  topicId: string
  topicTitle: string
}

export type NoteSearchHit = NoteTitleSearchHit | TopicSearchHit

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
  claimUnreferencedAsset: (input: { fileName: string, unreferencedBefore: number }) => Promise<StoredAsset | null>
  close: () => Promise<void>
  completeAssetDeletion: (input: { fileName: string }) => Promise<void>
  createNote: (input?: CreateNoteInput) => Promise<StoredNote>
  getAssetStatistics: () => Promise<AssetStatistics>
  getNote: (input: GetNoteInput) => Promise<StoredNote>
  getNoteFavorite: (input: GetNoteInput) => Promise<NoteFavoriteState>
  getTopicBlock: (input: GetTopicBlockInput) => Promise<StoredTopicBlock | null>
  indexPendingEmbeddings: (input?: IndexPendingEmbeddingsInput) => Promise<number>
  listFavoriteNotes: (input?: ListNoteActivityInput) => Promise<readonly FavoriteNoteItem[]>
  listNoteIds: () => Promise<readonly string[]>
  listNotes: (input?: ListNotesInput) => Promise<NotePage>
  listAssets: () => Promise<readonly StoredAsset[]>
  listClaimedAssets: () => Promise<readonly StoredAsset[]>
  listRecentNotes: (input?: ListNoteActivityInput) => Promise<readonly RecentNoteItem[]>
  listUnreferencedAssets: (input: { unreferencedBefore: number }) => Promise<readonly StoredAsset[]>
  openMostRecentNote: () => Promise<StoredNote>
  reconcileNoteAssetReferences: (input: ReconcileNoteAssetReferencesInput) => Promise<boolean>
  recordNoteOpened: (input: RecordNoteOpenedInput) => Promise<void>
  registerAsset: (input: RegisterAssetInput) => Promise<StoredAsset>
  releaseAssetClaim: (input: { fileName: string }) => Promise<void>
  saveNoteUpdates: (input: SaveNoteUpdatesInput) => Promise<NoteWriteReceipt>
  searchNotes: (input: SearchNotesInput) => Promise<readonly NoteSearchHit[]>
  searchTopicBlocks: (input: SearchTopicBlocksInput) => Promise<readonly TopicBlockSearchHit[]>
  setNoteFavorite: (input: SetNoteFavoriteInput) => Promise<NoteFavoriteState>
}

export interface CreateEditorStorageOptions {
  database: EditorStorageDatabase
  embeddingModel: EmbeddingModel
}

interface AssetRow {
  byte_size: number
  created_at: number
  file_name: string
  mime_type: string
  original_file_name: string
}

interface NoteRow {
  checkpoint_sequence: number
  checkpoint_snapshot: Uint8Array | null
  created_at: number
  id: string
  latest_sequence: number
  row_id: number
  title: string
  updated_at: number
}

interface NoteSummaryRow {
  created_at: number
  favorite: number
  id: string
  title: string
  updated_at: number
}

interface FavoriteNoteRow {
  favorited_at: number
  note_id: string
  note_title: string
  topic_id: string
  topic_title: string
}

interface RecentNoteRow {
  note_id: string
  note_title: string
  opened_at: number
  topic_id: string
  topic_title: string
}

interface FavoriteStateRow {
  favorite: number
}

interface AssetStatisticsRow {
  managed_asset_count: number
  reference_count: number
}

interface CountRow {
  count: number
}

interface TableColumnRow {
  name: string
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

interface NoteTitleSearchRow {
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
  note_id: string
  note_title: string
  preview: string
  rank: number
  topic_id: string
  topic_title: string
  updated_at: number
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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assets (
    file_name TEXT PRIMARY KEY,
    original_file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    created_at INTEGER NOT NULL,
    unreferenced_at INTEGER,
    deletion_claimed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS note_asset_references (
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    asset_file_name TEXT NOT NULL REFERENCES assets(file_name) ON DELETE RESTRICT,
    reference_count INTEGER NOT NULL CHECK (reference_count > 0),
    PRIMARY KEY (note_row_id, asset_file_name)
  );

  CREATE INDEX IF NOT EXISTS note_asset_references_asset_idx
    ON note_asset_references(asset_file_name);

  CREATE TRIGGER IF NOT EXISTS note_asset_references_insert_mark_referenced
  AFTER INSERT ON note_asset_references
  BEGIN
    UPDATE assets SET unreferenced_at = NULL WHERE file_name = new.asset_file_name;
  END;

  CREATE TRIGGER IF NOT EXISTS note_asset_references_delete_mark_unreferenced
  AFTER DELETE ON note_asset_references
  WHEN NOT EXISTS (
    SELECT 1 FROM note_asset_references WHERE asset_file_name = old.asset_file_name
  )
  BEGIN
    UPDATE assets
    SET unreferenced_at = COALESCE(
      unreferenced_at,
      CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    )
    WHERE file_name = old.asset_file_name;
  END;

  CREATE TRIGGER IF NOT EXISTS note_asset_references_insert_available
  BEFORE INSERT ON note_asset_references
  WHEN (SELECT deletion_claimed_at FROM assets WHERE file_name = new.asset_file_name) IS NOT NULL
  BEGIN
    SELECT RAISE(ABORT, 'Asset is being reclaimed');
  END;

  CREATE TRIGGER IF NOT EXISTS note_asset_references_update_available
  BEFORE UPDATE OF asset_file_name ON note_asset_references
  WHEN (SELECT deletion_claimed_at FROM assets WHERE file_name = new.asset_file_name) IS NOT NULL
  BEGIN
    SELECT RAISE(ABORT, 'Asset is being reclaimed');
  END;

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

  CREATE TABLE IF NOT EXISTS note_favorites (
    note_row_id INTEGER PRIMARY KEY REFERENCES notes(row_id) ON DELETE CASCADE,
    favorited_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS note_favorites_order_idx
    ON note_favorites(favorited_at DESC, note_row_id DESC);

  CREATE TABLE IF NOT EXISTS note_open_history (
    note_row_id INTEGER PRIMARY KEY REFERENCES notes(row_id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL,
    opened_at INTEGER NOT NULL,
    FOREIGN KEY (note_row_id, topic_id)
      REFERENCES topics(note_row_id, topic_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS note_open_history_order_idx
    ON note_open_history(opened_at DESC, note_row_id DESC);

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

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string')
    throw new TypeError(`${name} must be a string`)
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
      assertString(entry.title, `Topic ${entry.id} title`)
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
    assertString(topic.title, `Topic ${topic.topicId} title`)
    if (projectedTopics.has(topic.topicId))
      throw new Error(`Duplicate Topic projection: ${topic.topicId}`)
    projectedTopics.add(topic.topicId)
    const entry = topicEntries.get(topic.topicId)
    if (entries && !entry)
      throw new Error(`Topic projection ${topic.topicId} has no matching NoteEntry`)
    if (entry && entry.title !== topic.title)
      throw new Error(`Topic projection ${topic.topicId} title does not match its NoteEntry`)

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
    if (entry.kind === 'folder' && entry.parentId !== null && entriesById?.get(entry.parentId)?.kind === 'topic')
      throw new Error(`Folder ${entry.id} cannot use Topic ${entry.parentId} as its parent`)
  }
}

function contentHash(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)))
}

function updateHash(update: Uint8Array): string {
  return bytesToHex(sha256(update))
}

function validateAssetFileName(fileName: string): void {
  assertNonEmpty(fileName, 'Asset file name')
  if (!/^[0-9a-f-]+\.[a-z0-9]+$/.test(fileName))
    throw new TypeError('Asset file name has an invalid format')
}

function validateAssetReferences(references: readonly AssetReferenceProjection[]): void {
  const fileNames = new Set<string>()
  for (const reference of references) {
    validateAssetFileName(reference.fileName)
    if (!Number.isInteger(reference.count) || reference.count <= 0)
      throw new RangeError('Asset reference count must be a positive integer')
    if (fileNames.has(reference.fileName))
      throw new TypeError(`Duplicate asset reference: ${reference.fileName}`)
    fileNames.add(reference.fileName)
  }
}

function toStoredAsset(row: AssetRow): StoredAsset {
  return {
    byteSize: row.byte_size,
    createdAt: row.created_at,
    fileName: row.file_name,
    mimeType: row.mime_type,
    originalFileName: row.original_file_name,
  }
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

function topicSearchKey(hit: Pick<TopicSearchHit, 'noteId' | 'topicId'>): string {
  return `${hit.noteId}\0${hit.topicId}`
}

function topicSearchPreview(preview: string, topicTitle: string): string {
  const trimmed = preview.trim()
  return trimmed.length > 0 ? trimmed : topicTitle
}

function toTopicSearchHit(
  row: TopicSearchRow,
  match: Exclude<NoteSearchMatch, 'title'>,
): TopicSearchHit {
  return {
    blockId: row.block_id,
    kind: 'topic',
    match,
    noteId: row.note_id,
    noteTitle: row.note_title,
    preview: topicSearchPreview(row.preview, row.topic_title),
    rank: row.rank,
    topicId: row.topic_id,
    topicTitle: row.topic_title,
  }
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

    const noteColumns = await options.database.all<TableColumnRow>('PRAGMA table_info(notes)')
    if (!noteColumns.some(column => column.name === 'created_at')) {
      throw new Error(
        'Unsupported notes schema: created_at is required; delete the existing database before starting Memorilo',
      )
    }

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

  async #assertUniqueNoteTitle(title: string, excludedNoteId?: string): Promise<void> {
    const duplicate = excludedNoteId === undefined
      ? await this.#database.get<{ id: string }>(`
          SELECT id FROM notes WHERE title = ? COLLATE NOCASE LIMIT 1
        `, [title])
      : await this.#database.get<{ id: string }>(`
          SELECT id FROM notes WHERE title = ? COLLATE NOCASE AND id <> ? LIMIT 1
        `, [title, excludedNoteId])
    if (duplicate)
      throw new DuplicateNoteTitleError(title)
  }

  async #insertNote(title: string): Promise<NoteRow> {
    await this.#assertUniqueNoteTitle(title)
    const now = Date.now()
    const id = createUuidV7()
    await this.#database.run(`
      INSERT INTO notes (
        id, title, checkpoint_snapshot, checkpoint_sequence, latest_sequence, created_at, updated_at
      )
      VALUES (?, ?, NULL, 0, 0, ?, ?)
    `, [id, title, now, now])
    const note = await this.#database.get<NoteRow>(`
      SELECT
        row_id,
        id,
        title,
        checkpoint_snapshot,
        checkpoint_sequence,
        latest_sequence,
        created_at,
        updated_at
      FROM notes
      WHERE id = ?
    `, [id])
    if (!note)
      throw new Error(`Failed to read newly created Note: ${id}`)
    return note
  }

  async #readStoredNote(note: NoteRow): Promise<StoredNote> {
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
      createdAt: note.created_at,
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
  }

  async claimUnreferencedAsset(input: { fileName: string, unreferencedBefore: number }): Promise<StoredAsset | null> {
    validateAssetFileName(input.fileName)
    if (!Number.isFinite(input.unreferencedBefore))
      throw new TypeError('Asset reference cutoff must be finite')
    return this.#serializeWrite(async () => {
      const row = await this.#database.get<AssetRow>(`
        UPDATE assets
        SET deletion_claimed_at = ?
        WHERE file_name = ?
          AND unreferenced_at <= ?
          AND deletion_claimed_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM note_asset_references WHERE asset_file_name = assets.file_name
          )
        RETURNING file_name, original_file_name, mime_type, byte_size, created_at
      `, [Date.now(), input.fileName, input.unreferencedBefore])
      return row ? toStoredAsset(row) : null
    })
  }

  async close(): Promise<void> {
    await this.#writeQueue
    await this.#database.close()
  }

  async completeAssetDeletion(input: { fileName: string }): Promise<void> {
    validateAssetFileName(input.fileName)
    return this.#serializeWrite(async () => {
      await this.#database.run(`
        DELETE FROM assets
        WHERE file_name = ?
          AND deletion_claimed_at IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM note_asset_references WHERE asset_file_name = assets.file_name
          )
      `, [input.fileName])
    })
  }

  async createNote(input: CreateNoteInput = {}): Promise<StoredNote> {
    const title = input.title?.trim() ?? 'Untitled'
    assertNonEmpty(title, 'Note title')
    return this.#serializeWrite(async () => this.#readStoredNote(await this.#insertNote(title)))
  }

  async getAssetStatistics(): Promise<AssetStatistics> {
    const row = await this.#database.get<AssetStatisticsRow>(`
      SELECT
        (SELECT COUNT(*) FROM assets) AS managed_asset_count,
        (SELECT COALESCE(SUM(reference_count), 0) FROM note_asset_references) AS reference_count
    `)
    if (!row)
      throw new Error('Failed to read Asset statistics')
    return {
      managedAssetCount: row.managed_asset_count,
      referenceCount: row.reference_count,
    }
  }

  async getNote(input: GetNoteInput): Promise<StoredNote> {
    assertNonEmpty(input.noteId, 'Note id')
    return this.#serializeWrite(async () => {
      const note = await this.#database.get<NoteRow>(`
        SELECT
          row_id,
          id,
          title,
          checkpoint_snapshot,
          checkpoint_sequence,
          latest_sequence,
          created_at,
          updated_at
        FROM notes
        WHERE id = ?
      `, [input.noteId])
      if (!note)
        throw new Error(`Unknown Note: ${input.noteId}`)
      return this.#readStoredNote(note)
    })
  }

  async getNoteFavorite(input: GetNoteInput): Promise<NoteFavoriteState> {
    assertNonEmpty(input.noteId, 'Note id')
    return this.#serializeWrite(async () => {
      const row = await this.#database.get<FavoriteStateRow>(`
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

  async listFavoriteNotes(input: ListNoteActivityInput = {}): Promise<readonly FavoriteNoteItem[]> {
    const limit = resolveLimit(input.limit, 6, 100)
    return this.#serializeWrite(async () => {
      const rows = await this.#database.all<FavoriteNoteRow>(`
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
          COALESCE(history.topic_id, first_topic.topic_id) AS topic_id,
          COALESCE(history_topic.title, first_topic.title) AS topic_title,
          favorite.favorited_at
        FROM note_favorites AS favorite
        INNER JOIN notes AS note ON note.row_id = favorite.note_row_id
        INNER JOIN first_topics AS first_topic
          ON first_topic.note_row_id = note.row_id AND first_topic.position = 1
        LEFT JOIN note_open_history AS history ON history.note_row_id = note.row_id
        LEFT JOIN topics AS history_topic
          ON history_topic.note_row_id = note.row_id AND history_topic.topic_id = history.topic_id
        ORDER BY favorite.favorited_at DESC, note.id DESC
        LIMIT ?
      `, [limit])
      return rows.map(row => ({
        favoritedAt: row.favorited_at,
        noteId: row.note_id,
        noteTitle: row.note_title,
        topicId: row.topic_id,
        topicTitle: row.topic_title,
      }))
    })
  }

  async listNoteIds(): Promise<readonly string[]> {
    return this.#serializeWrite(async () => {
      const rows = await this.#database.all<{ id: string }>('SELECT id FROM notes ORDER BY id ASC')
      return rows.map(row => row.id)
    })
  }

  async listNotes(input: ListNotesInput = {}): Promise<NotePage> {
    const page = resolvePage(input.page)
    const pageSize = resolveLimit(input.pageSize, 50, 100)
    const orderBy = resolveNoteOrderBy(input.sortBy, input.sortDirection)
    const offset = (page - 1) * pageSize
    if (!Number.isSafeInteger(offset))
      throw new RangeError('Page offset exceeds the safe integer range')

    return this.#serializeWrite(async () => {
      const [countRow, rows] = await Promise.all([
        this.#database.get<CountRow>('SELECT COUNT(*) AS count FROM notes'),
        this.#database.all<NoteSummaryRow>(`
          SELECT
            note.id,
            note.title,
            note.created_at,
            note.updated_at,
            EXISTS(
              SELECT 1
              FROM note_favorites AS favorite
              WHERE favorite.note_row_id = note.row_id
            ) AS favorite
          FROM notes AS note
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?
        `, [pageSize, offset]),
      ])
      if (!countRow)
        throw new Error('Failed to count Notes')
      return {
        items: rows.map(row => ({
          createdAt: row.created_at,
          favorite: row.favorite === 1,
          id: row.id,
          title: row.title,
          updatedAt: row.updated_at,
        })),
        page,
        pageSize,
        totalItems: countRow.count,
        totalPages: Math.ceil(countRow.count / pageSize),
      }
    })
  }

  async listAssets(): Promise<readonly StoredAsset[]> {
    const rows = await this.#database.all<AssetRow>(`
      SELECT file_name, original_file_name, mime_type, byte_size, created_at
      FROM assets
      ORDER BY created_at ASC, file_name ASC
    `)
    return rows.map(toStoredAsset)
  }

  async listClaimedAssets(): Promise<readonly StoredAsset[]> {
    const rows = await this.#database.all<AssetRow>(`
      SELECT file_name, original_file_name, mime_type, byte_size, created_at
      FROM assets
      WHERE deletion_claimed_at IS NOT NULL
      ORDER BY created_at ASC, file_name ASC
    `)
    return rows.map(toStoredAsset)
  }

  async listRecentNotes(input: ListNoteActivityInput = {}): Promise<readonly RecentNoteItem[]> {
    const limit = resolveLimit(input.limit, 6, 100)
    return this.#serializeWrite(async () => {
      const rows = await this.#database.all<RecentNoteRow>(`
        SELECT
          note.id AS note_id,
          note.title AS note_title,
          history.topic_id,
          topic.title AS topic_title,
          history.opened_at
        FROM note_open_history AS history
        INNER JOIN notes AS note ON note.row_id = history.note_row_id
        INNER JOIN topics AS topic
          ON topic.note_row_id = history.note_row_id AND topic.topic_id = history.topic_id
        ORDER BY history.opened_at DESC, note.id DESC
        LIMIT ?
      `, [limit])
      return rows.map(row => ({
        noteId: row.note_id,
        noteTitle: row.note_title,
        openedAt: row.opened_at,
        topicId: row.topic_id,
        topicTitle: row.topic_title,
      }))
    })
  }

  async listUnreferencedAssets(input: { unreferencedBefore: number }): Promise<readonly StoredAsset[]> {
    if (!Number.isFinite(input.unreferencedBefore))
      throw new TypeError('Asset reference cutoff must be finite')
    const rows = await this.#database.all<AssetRow>(`
      SELECT file_name, original_file_name, mime_type, byte_size, created_at
      FROM assets
      WHERE unreferenced_at <= ?
        AND deletion_claimed_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM note_asset_references WHERE asset_file_name = assets.file_name
        )
      ORDER BY created_at ASC, file_name ASC
    `, [input.unreferencedBefore])
    return rows.map(toStoredAsset)
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
          created_at,
          updated_at
        FROM notes
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `)

      note ??= await this.#insertNote('Untitled')
      return this.#readStoredNote(note)
    })
  }

  async reconcileNoteAssetReferences(input: ReconcileNoteAssetReferencesInput): Promise<boolean> {
    assertNonEmpty(input.noteId, 'Note id')
    if (!Number.isInteger(input.expectedLatestSequence) || input.expectedLatestSequence < 0)
      throw new RangeError('Expected Note sequence must be a non-negative integer')
    validateAssetReferences(input.references)
    input.allowedMissingAssetFileNames?.forEach(validateAssetFileName)
    const saved = structuredClone(input)
    return this.#serializeWrite(async () => {
      const note = await this.#database.get<{ latest_sequence: number, row_id: number }>(
        'SELECT row_id, latest_sequence FROM notes WHERE id = ?',
        [saved.noteId],
      )
      if (!note)
        throw new Error(`Unknown Note: ${saved.noteId}`)
      if (note.latest_sequence !== saved.expectedLatestSequence)
        return false

      const availableReferences: AssetReferenceProjection[] = []
      for (const reference of saved.references) {
        const asset = await this.#database.get<{ deletion_claimed_at: number | null }>(
          'SELECT deletion_claimed_at FROM assets WHERE file_name = ?',
          [reference.fileName],
        )
        if (!asset) {
          if (saved.allowedMissingAssetFileNames?.includes(reference.fileName))
            continue
          throw new Error(`Unknown Asset: ${reference.fileName}`)
        }
        if (asset.deletion_claimed_at !== null)
          throw new Error(`Asset is being reclaimed: ${reference.fileName}`)
        availableReferences.push(reference)
      }

      const commands: DatabaseCommand[] = [{
        parameters: [note.row_id],
        sql: 'DELETE FROM note_asset_references WHERE note_row_id = ?',
      }]
      for (const reference of availableReferences) {
        commands.push({
          parameters: [note.row_id, reference.fileName, reference.count],
          sql: `
            INSERT INTO note_asset_references (note_row_id, asset_file_name, reference_count)
            VALUES (?, ?, ?)
          `,
        })
      }
      await this.#database.batch(commands)
      return true
    })
  }

  async recordNoteOpened(input: RecordNoteOpenedInput): Promise<void> {
    assertNonEmpty(input.noteId, 'Note id')
    assertNonEmpty(input.topicId, 'Topic id')
    return this.#serializeWrite(async () => {
      const topic = await this.#database.get<{ note_row_id: number }>(`
        SELECT topic.note_row_id
        FROM topics AS topic
        INNER JOIN notes AS note ON note.row_id = topic.note_row_id
        WHERE note.id = ? AND topic.topic_id = ?
      `, [input.noteId, input.topicId])
      if (!topic)
        throw new Error(`Note ${input.noteId} does not contain Topic ${input.topicId}`)

      await this.#database.run(`
        INSERT INTO note_open_history (note_row_id, topic_id, opened_at)
        VALUES (?, ?, ?)
        ON CONFLICT(note_row_id) DO UPDATE SET
          topic_id = excluded.topic_id,
          opened_at = excluded.opened_at
      `, [topic.note_row_id, input.topicId, Date.now()])
    })
  }

  async setNoteFavorite(input: SetNoteFavoriteInput): Promise<NoteFavoriteState> {
    assertNonEmpty(input.noteId, 'Note id')
    if (typeof input.favorite !== 'boolean')
      throw new TypeError('Note favorite state must be a boolean')
    return this.#serializeWrite(async () => {
      const note = await this.#database.get<{ row_id: number }>(
        'SELECT row_id FROM notes WHERE id = ?',
        [input.noteId],
      )
      if (!note)
        throw new Error(`Unknown Note: ${input.noteId}`)

      if (input.favorite) {
        await this.#database.run(`
          INSERT INTO note_favorites (note_row_id, favorited_at)
          VALUES (?, ?)
          ON CONFLICT(note_row_id) DO NOTHING
        `, [note.row_id, Date.now()])
      }
      else {
        await this.#database.run(
          'DELETE FROM note_favorites WHERE note_row_id = ?',
          [note.row_id],
        )
      }
      return { favorite: input.favorite, noteId: input.noteId }
    })
  }

  async registerAsset(input: RegisterAssetInput): Promise<StoredAsset> {
    validateAssetFileName(input.fileName)
    assertNonEmpty(input.originalFileName, 'Original asset file name')
    assertNonEmpty(input.mimeType, 'Asset MIME type')
    if (!Number.isInteger(input.byteSize) || input.byteSize <= 0)
      throw new RangeError('Asset byte size must be a positive integer')
    if (input.createdAt !== undefined && !Number.isFinite(input.createdAt))
      throw new TypeError('Asset creation time must be finite')
    const saved = structuredClone(input)
    return this.#serializeWrite(async () => {
      const createdAt = saved.createdAt ?? Date.now()
      await this.#database.run(`
        INSERT INTO assets (
          file_name, original_file_name, mime_type, byte_size, created_at, unreferenced_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_name) DO NOTHING
      `, [saved.fileName, saved.originalFileName, saved.mimeType, saved.byteSize, createdAt, createdAt])
      const row = await this.#database.get<AssetRow>(`
        SELECT file_name, original_file_name, mime_type, byte_size, created_at
        FROM assets WHERE file_name = ?
      `, [saved.fileName])
      if (!row)
        throw new Error(`Failed to read registered Asset: ${saved.fileName}`)
      return toStoredAsset(row)
    })
  }

  async releaseAssetClaim(input: { fileName: string }): Promise<void> {
    validateAssetFileName(input.fileName)
    return this.#serializeWrite(async () => {
      await this.#database.run(
        'UPDATE assets SET deletion_claimed_at = NULL WHERE file_name = ?',
        [input.fileName],
      )
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
    if (input.assetReferences !== undefined)
      validateAssetReferences(input.assetReferences)
    input.allowedMissingAssetFileNames?.forEach(validateAssetFileName)
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
          created_at,
          updated_at
        FROM notes
        WHERE id = ?
      `, [saved.noteId])
      if (!note)
        throw new Error(`Unknown Note: ${saved.noteId}`)
      if (saved.title !== undefined && saved.title !== note.title)
        await this.#assertUniqueNoteTitle(saved.title, note.id)

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
        return { acceptedUpdateHashes: [], latestSequence: note.latest_sequence, updatedAt: note.updated_at }

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
      if (saved.assetReferences !== undefined) {
        const allowedMissingAssetFileNames = new Set(saved.allowedMissingAssetFileNames)
        for (const reference of saved.assetReferences) {
          const asset = await this.#database.get<{ deletion_claimed_at: number | null }>(
            'SELECT deletion_claimed_at FROM assets WHERE file_name = ?',
            [reference.fileName],
          )
          if (!asset) {
            if (allowedMissingAssetFileNames.has(reference.fileName))
              continue
            throw new Error(`Unknown Asset: ${reference.fileName}`)
          }
          if (asset.deletion_claimed_at !== null)
            throw new Error(`Asset is being reclaimed: ${reference.fileName}`)
        }

        commands.push({
          parameters: [note.row_id],
          sql: 'DELETE FROM note_asset_references WHERE note_row_id = ?',
        })
        for (const reference of saved.assetReferences) {
          if (allowedMissingAssetFileNames.has(reference.fileName)) {
            const asset = await this.#database.get<{ file_name: string }>(
              'SELECT file_name FROM assets WHERE file_name = ?',
              [reference.fileName],
            )
            if (!asset)
              continue
          }
          commands.push({
            parameters: [note.row_id, reference.fileName, reference.count],
            sql: `
              INSERT INTO note_asset_references (note_row_id, asset_file_name, reference_count)
              VALUES (?, ?, ?)
            `,
          })
        }
      }
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

      for (const topic of saved.topics) {
        commands.push(
          {
            parameters: [topic.title, note.row_id, topic.topicId],
            sql: 'UPDATE topics SET title = ? WHERE note_row_id = ? AND topic_id = ?',
          },
          {
            parameters: [topic.title, note.row_id, topic.topicId],
            sql: 'UPDATE note_entries SET label = ? WHERE note_row_id = ? AND entry_id = ?',
          },
        )
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
      return { acceptedUpdateHashes: newUpdates.map(update => update.hash), latestSequence, updatedAt: now }
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
          created_at,
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

      await this.#database.batch([
        {
          parameters: [saved.snapshot, saved.throughSequence, note.row_id],
          sql: `
            UPDATE notes
            SET checkpoint_snapshot = ?, checkpoint_sequence = ?
            WHERE row_id = ?
          `,
        },
        {
          parameters: [note.row_id, saved.throughSequence],
          sql: 'DELETE FROM note_updates WHERE note_row_id = ? AND sequence <= ?',
        },
      ])
      return { acceptedUpdateHashes: [], latestSequence: note.latest_sequence, updatedAt: note.updated_at }
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

  async searchNotes(input: SearchNotesInput): Promise<readonly NoteSearchHit[]> {
    const query = input.query.trim()
    if (query.length === 0)
      return []
    const limit = resolveLimit(input.limit, 20, 50)
    const candidateLimit = Math.min(Math.max(limit * 4, 32), 100)
    const [titles, nodeStarts, content, semantic] = await Promise.all([
      this.#searchNoteTitles(query, candidateLimit),
      this.#searchTopicNodeStarts(query, candidateLimit),
      this.#searchTopicContent(query, candidateLimit),
      this.#searchTopicSemantically(query, candidateLimit),
    ])

    const results: NoteSearchHit[] = []
    const seenTopics = new Set<string>()
    for (const hit of titles) {
      if (hit.kind === 'topic')
        seenTopics.add(topicSearchKey(hit))
      results.push(hit)
    }
    const addTopics = (hits: readonly TopicSearchHit[]) => {
      for (const hit of hits) {
        const key = topicSearchKey(hit)
        if (seenTopics.has(key))
          continue
        seenTopics.add(key)
        results.push(hit)
      }
    }
    addTopics(nodeStarts)
    addTopics(content)
    addTopics(semantic)
    return results.slice(0, limit)
  }

  async #searchNoteTitles(query: string, limit: number): Promise<readonly NoteSearchHit[]> {
    const rows = await this.#database.all<NoteTitleSearchRow>(`
      SELECT
        kind,
        note_id,
        note_title,
        topic_id,
        topic_title,
        updated_at,
        match_position
      FROM (
        SELECT
          'note' AS kind,
          n.id AS note_id,
          n.title AS note_title,
          NULL AS topic_id,
          NULL AS topic_title,
          n.updated_at,
          instr(lower(n.title), lower(?)) AS match_position
        FROM notes n

        UNION ALL

        SELECT
          'topic' AS kind,
          n.id AS note_id,
          n.title AS note_title,
          t.topic_id,
          t.title AS topic_title,
          n.updated_at,
          instr(lower(t.title), lower(?)) AS match_position
        FROM topics t
        JOIN notes n ON n.row_id = t.note_row_id
      ) title_matches
      WHERE match_position > 0
      ORDER BY
        match_position ASC,
        CASE kind WHEN 'note' THEN 0 ELSE 1 END ASC,
        updated_at DESC,
        note_title COLLATE NOCASE ASC
      LIMIT ?
    `, [query, query, limit])

    return rows.map((row): NoteSearchHit => {
      if (row.kind === 'note') {
        return {
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

  async #searchTopicNodeStarts(query: string, limit: number): Promise<readonly TopicSearchHit[]> {
    const rows = await this.#database.all<TopicSearchRow>(`
      SELECT
        n.id AS note_id,
        n.title AS note_title,
        n.updated_at,
        t.topic_id,
        t.title AS topic_title,
        b.block_id,
        b.text AS preview,
        b.ordinal AS rank
      FROM topic_blocks b
      JOIN topics t ON t.note_row_id = b.note_row_id AND t.topic_id = b.topic_id
      JOIN notes n ON n.row_id = b.note_row_id
      WHERE instr(lower(ltrim(b.text)), lower(?)) = 1
      ORDER BY n.updated_at DESC, t.row_id ASC, b.ordinal ASC, b.row_id ASC
      LIMIT ?
    `, [query, limit])
    return rows.map(row => toTopicSearchHit(row, 'node-start'))
  }

  async #searchTopicContent(query: string, limit: number): Promise<readonly TopicSearchHit[]> {
    let rows: readonly TopicSearchRow[]
    if ([...query].length < 3) {
      rows = await this.#database.all<TopicSearchRow>(`
        SELECT
          n.id AS note_id,
          n.title AS note_title,
          n.updated_at,
          t.topic_id,
          t.title AS topic_title,
          b.block_id,
          b.text AS preview,
          b.ordinal AS rank
        FROM topic_blocks b
        JOIN topics t ON t.note_row_id = b.note_row_id AND t.topic_id = b.topic_id
        JOIN notes n ON n.row_id = b.note_row_id
        WHERE instr(lower(b.text), lower(?)) > 0
        ORDER BY n.updated_at DESC, t.row_id ASC, b.ordinal ASC, b.row_id ASC
        LIMIT ?
      `, [query, limit])
    }
    else {
      rows = await this.#database.all<TopicSearchRow>(`
        SELECT
          n.id AS note_id,
          n.title AS note_title,
          n.updated_at,
          t.topic_id,
          t.title AS topic_title,
          b.block_id,
          snippet(topic_blocks_fts, 0, '', '', '…', 24) AS preview,
          bm25(topic_blocks_fts) AS rank
        FROM topic_blocks_fts
        JOIN topic_blocks b ON b.row_id = topic_blocks_fts.rowid
        JOIN topics t ON t.note_row_id = b.note_row_id AND t.topic_id = b.topic_id
        JOIN notes n ON n.row_id = b.note_row_id
        WHERE topic_blocks_fts MATCH ?
        ORDER BY rank ASC, n.updated_at DESC
        LIMIT ?
      `, [quoteFtsQuery(query), limit])
    }
    return rows.map(row => toTopicSearchHit(row, 'content'))
  }

  async #searchTopicSemantically(query: string, limit: number): Promise<readonly TopicSearchHit[]> {
    const vector = await this.#embeddingModel.embedQuery(query)
    validateVector(vector, this.#embeddingModel)
    const rows = await this.#database.all<TopicSearchRow>(`
      SELECT
        n.id AS note_id,
        n.title AS note_title,
        n.updated_at,
        t.topic_id,
        t.title AS topic_title,
        b.block_id,
        b.text AS preview,
        nearest.distance AS rank
      FROM (
        SELECT block_row_id, distance
        FROM topic_block_embeddings
        WHERE embedding MATCH ? AND k = ?
      ) nearest
      JOIN topic_blocks b ON b.row_id = nearest.block_row_id
      JOIN topics t ON t.note_row_id = b.note_row_id AND t.topic_id = b.topic_id
      JOIN notes n ON n.row_id = b.note_row_id
      ORDER BY nearest.distance ASC, n.updated_at DESC
    `, [serializeVector(vector), limit])
    return rows.map(row => toTopicSearchHit(row, 'semantic'))
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
