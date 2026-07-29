import type { DatabaseCommand, DatabaseValue, EditorStorageDatabase } from './database-driver'
import type { EmbeddingModel } from './embedding-model'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { v7 as createUuidV7 } from 'uuid'

export interface DocumentNodeSnapshot {
  attributes: Readonly<Record<string, unknown>>
  id: string
  kind: string
  ordinal: number
  parentId: string | null
  text: string
}

export interface StoredDocument {
  id: string
  snapshot: Uint8Array | null
  title: string
  updatedAt: number
}

export interface SaveDocumentInput {
  id: string
  nodes: readonly DocumentNodeSnapshot[]
  snapshot: Uint8Array
  title: string
}

export interface GetNodeInput {
  documentId: string
  nodeId: string
}

export type NodeSearchMode = 'hybrid' | 'lexical' | 'semantic'

export interface SearchNodesInput {
  documentId?: string
  limit?: number
  mode?: NodeSearchMode
  query: string
}

export interface IndexPendingEmbeddingsInput {
  documentId?: string
  limit?: number
}

export interface StoredDocumentNode extends DocumentNodeSnapshot {
  contentHash: string
  documentId: string
}

export interface NodeSearchHit extends StoredDocumentNode {
  preview: string
  rank: number
}

export interface EditorStorage {
  close: () => Promise<void>
  getNode: (input: GetNodeInput) => Promise<StoredDocumentNode | null>
  indexPendingEmbeddings: (input?: IndexPendingEmbeddingsInput) => Promise<number>
  openMostRecentDocument: () => Promise<StoredDocument>
  saveDocument: (input: SaveDocumentInput) => Promise<StoredDocument>
  searchNodes: (input: SearchNodesInput) => Promise<readonly NodeSearchHit[]>
}

export interface CreateEditorStorageOptions {
  database: EditorStorageDatabase
  embeddingModel: EmbeddingModel
}

interface DocumentRow {
  crdt_snapshot: Uint8Array | null
  id: string
  row_id: number
  title: string
  updated_at: number
}

interface ExistingNodeRow {
  content_hash: string
  node_id: string
  row_id: number
}

interface DocumentNodeRow {
  attributes_json: string
  content_hash: string
  document_id: string
  kind: string
  node_id: string
  ordinal: number
  parent_node_id: string | null
  text: string
}

interface NodeSearchRow extends DocumentNodeRow {
  preview: string
  rank: number
}

interface PendingEmbeddingRow {
  content_hash: string
  document_row_id: number
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

  CREATE TABLE IF NOT EXISTS documents (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    crdt_snapshot BLOB,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS document_nodes (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_row_id INTEGER NOT NULL REFERENCES documents(row_id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    parent_node_id TEXT,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    attributes_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    UNIQUE (document_row_id, node_id)
  );

  CREATE INDEX IF NOT EXISTS document_nodes_parent_order_idx
    ON document_nodes(document_row_id, parent_node_id, ordinal);

  CREATE VIRTUAL TABLE IF NOT EXISTS document_nodes_fts USING fts5(
    text,
    content='document_nodes',
    content_rowid='row_id',
    tokenize='trigram'
  );

  CREATE TRIGGER IF NOT EXISTS document_nodes_fts_insert
  AFTER INSERT ON document_nodes BEGIN
    INSERT INTO document_nodes_fts(rowid, text) VALUES (new.row_id, new.text);
  END;

  CREATE TRIGGER IF NOT EXISTS document_nodes_fts_delete
  AFTER DELETE ON document_nodes BEGIN
    INSERT INTO document_nodes_fts(document_nodes_fts, rowid, text)
      VALUES ('delete', old.row_id, old.text);
  END;

  CREATE TRIGGER IF NOT EXISTS document_nodes_fts_update
  AFTER UPDATE OF text ON document_nodes BEGIN
    INSERT INTO document_nodes_fts(document_nodes_fts, rowid, text)
      VALUES ('delete', old.row_id, old.text);
    INSERT INTO document_nodes_fts(rowid, text) VALUES (new.row_id, new.text);
  END;

  CREATE TABLE IF NOT EXISTS editor_storage_embedding_configuration (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    model_id TEXT NOT NULL,
    dimensions INTEGER NOT NULL CHECK (dimensions > 0)
  );

  CREATE TABLE IF NOT EXISTS document_node_embedding_state (
    node_row_id INTEGER PRIMARY KEY REFERENCES document_nodes(row_id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    content_hash TEXT NOT NULL
  );
`

function vectorSchema(dimensions: number): string {
  return `
    CREATE VIRTUAL TABLE IF NOT EXISTS document_node_embeddings USING vec0(
      node_row_id INTEGER PRIMARY KEY,
      document_row_id INTEGER PARTITION KEY,
      embedding FLOAT[${dimensions}]
    );
  `
}

function assertNonEmpty(value: string, name: string): void {
  if (value.length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
}

function validateEmbeddingModel(model: EmbeddingModel): void {
  assertNonEmpty(model.id, 'Embedding model id')
  if (!Number.isInteger(model.dimensions) || model.dimensions < 1)
    throw new RangeError('Embedding model dimensions must be a positive integer')
}

function validateNodes(nodes: readonly DocumentNodeSnapshot[]): void {
  const byId = new Map<string, DocumentNodeSnapshot>()
  const siblingPositions = new Set<string>()

  for (const node of nodes) {
    assertNonEmpty(node.id, 'Node id')
    assertNonEmpty(node.kind, `Node ${node.id} kind`)
    if (!Number.isInteger(node.ordinal) || node.ordinal < 0)
      throw new RangeError(`Node ${node.id} ordinal must be a non-negative integer`)
    if (byId.has(node.id))
      throw new Error(`Duplicate node id: ${node.id}`)
    if (node.parentId === node.id)
      throw new Error(`Node ${node.id} cannot be its own parent`)
    if (node.attributes === null || Array.isArray(node.attributes) || typeof node.attributes !== 'object')
      throw new TypeError(`Node ${node.id} attributes must be an object`)

    byId.set(node.id, node)
    const siblingPosition = `${node.parentId ?? '<root>'}\0${node.ordinal}`
    if (siblingPositions.has(siblingPosition))
      throw new Error(`Duplicate node ordinal ${node.ordinal} under parent ${node.parentId ?? '<root>'}`)
    siblingPositions.add(siblingPosition)
  }

  for (const node of nodes) {
    if (node.parentId !== null && !byId.has(node.parentId))
      throw new Error(`Node ${node.id} has unknown parent ${node.parentId}`)

    const ancestors = new Set<string>([node.id])
    let parentId = node.parentId
    while (parentId !== null) {
      if (ancestors.has(parentId))
        throw new Error(`Node ${node.id} belongs to a parent cycle`)
      ancestors.add(parentId)
      const parent = byId.get(parentId)
      if (!parent)
        throw new Error(`Node ${node.id} has unknown parent ${parentId}`)
      parentId = parent.parentId
    }
  }
}

function contentHash(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)))
}

function parseAttributes(json: string): Readonly<Record<string, unknown>> {
  const value: unknown = JSON.parse(json)
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw new TypeError('Stored node attributes must be a JSON object')
  return value as Record<string, unknown>
}

function toStoredDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    snapshot: row.crdt_snapshot === null ? null : new Uint8Array(row.crdt_snapshot),
    title: row.title,
    updatedAt: row.updated_at,
  }
}

function toStoredNode(row: DocumentNodeRow): StoredDocumentNode {
  return {
    attributes: parseAttributes(row.attributes_json),
    contentHash: row.content_hash,
    documentId: row.document_id,
    id: row.node_id,
    kind: row.kind,
    ordinal: row.ordinal,
    parentId: row.parent_node_id,
    text: row.text,
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

function nodeKey(node: StoredDocumentNode): string {
  return `${node.documentId}\0${node.id}`
}

function fuseSearchResults(
  lexical: readonly NodeSearchHit[],
  semantic: readonly NodeSearchHit[],
  limit: number,
): readonly NodeSearchHit[] {
  const candidates = new Map<string, { hit: NodeSearchHit, score: number }>()

  const add = (hits: readonly NodeSearchHit[]) => {
    for (const [index, hit] of hits.entries()) {
      const key = nodeKey(hit)
      const score = 1 / (60 + index + 1)
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
        { sql: 'DROP TABLE IF EXISTS document_node_embeddings' },
        { sql: 'DELETE FROM document_node_embedding_state' },
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

  async close(): Promise<void> {
    await this.#database.close()
  }

  async openMostRecentDocument(): Promise<StoredDocument> {
    const existing = await this.#database.get<DocumentRow>(`
      SELECT row_id, id, title, crdt_snapshot, updated_at
      FROM documents
      ORDER BY updated_at DESC, row_id DESC
      LIMIT 1
    `)

    if (existing)
      return toStoredDocument(existing)

    const now = Date.now()
    const id = createUuidV7()
    await this.#database.run(`
      INSERT INTO documents (id, title, crdt_snapshot, updated_at)
      VALUES (?, ?, NULL, ?)
    `, [id, 'Untitled', now])

    return { id, snapshot: null, title: 'Untitled', updatedAt: now }
  }

  async saveDocument(input: SaveDocumentInput): Promise<StoredDocument> {
    assertNonEmpty(input.id, 'Document id')
    assertNonEmpty(input.title, 'Document title')
    if (!(input.snapshot instanceof Uint8Array) || input.snapshot.byteLength === 0)
      throw new TypeError('Document snapshot must be a non-empty Uint8Array')
    validateNodes(input.nodes)

    const document = await this.#database.get<DocumentRow>(`
      SELECT row_id, id, title, crdt_snapshot, updated_at
      FROM documents
      WHERE id = ?
    `, [input.id])
    if (!document)
      throw new Error(`Unknown document: ${input.id}`)

    const existingNodes = await this.#database.all<ExistingNodeRow>(`
      SELECT row_id, node_id, content_hash
      FROM document_nodes
      WHERE document_row_id = ?
    `, [document.row_id])
    const nextNodes = new Map(input.nodes.map(node => [node.id, { hash: contentHash(node.text), node }]))
    const commands: DatabaseCommand[] = []

    for (const existing of existingNodes) {
      const next = nextNodes.get(existing.node_id)
      if (!next || next.hash !== existing.content_hash) {
        commands.push(
          { parameters: [existing.row_id], sql: 'DELETE FROM document_node_embeddings WHERE node_row_id = ?' },
          { parameters: [existing.row_id], sql: 'DELETE FROM document_node_embedding_state WHERE node_row_id = ?' },
        )
      }
    }

    const now = Date.now()
    commands.push({
      parameters: [input.title, input.snapshot, now, document.row_id],
      sql: `
        UPDATE documents
        SET title = ?, crdt_snapshot = ?, updated_at = ?
        WHERE row_id = ?
      `,
    })

    for (const { hash, node } of nextNodes.values()) {
      commands.push({
        parameters: [
          document.row_id,
          node.id,
          node.parentId,
          node.ordinal,
          node.kind,
          node.text,
          JSON.stringify(node.attributes),
          hash,
        ],
        sql: `
          INSERT INTO document_nodes (
            document_row_id,
            node_id,
            parent_node_id,
            ordinal,
            kind,
            text,
            attributes_json,
            content_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(document_row_id, node_id) DO UPDATE SET
            parent_node_id = excluded.parent_node_id,
            ordinal = excluded.ordinal,
            kind = excluded.kind,
            text = excluded.text,
            attributes_json = excluded.attributes_json,
            content_hash = excluded.content_hash
        `,
      })
    }

    for (const existing of existingNodes) {
      if (!nextNodes.has(existing.node_id)) {
        commands.push({
          parameters: [document.row_id, existing.node_id],
          sql: 'DELETE FROM document_nodes WHERE document_row_id = ? AND node_id = ?',
        })
      }
    }

    await this.#database.batch(commands)
    return {
      id: input.id,
      snapshot: new Uint8Array(input.snapshot),
      title: input.title,
      updatedAt: now,
    }
  }

  async getNode(input: GetNodeInput): Promise<StoredDocumentNode | null> {
    assertNonEmpty(input.documentId, 'Document id')
    assertNonEmpty(input.nodeId, 'Node id')
    const row = await this.#database.get<DocumentNodeRow>(`
      SELECT
        d.id AS document_id,
        n.node_id,
        n.parent_node_id,
        n.ordinal,
        n.kind,
        n.text,
        n.attributes_json,
        n.content_hash
      FROM document_nodes n
      JOIN documents d ON d.row_id = n.document_row_id
      WHERE d.id = ? AND n.node_id = ?
    `, [input.documentId, input.nodeId])

    return row ? toStoredNode(row) : null
  }

  async indexPendingEmbeddings(input: IndexPendingEmbeddingsInput = {}): Promise<number> {
    if (input.documentId !== undefined)
      assertNonEmpty(input.documentId, 'Document id')
    const limit = resolveLimit(input.limit, 32, 256)
    const rows = await this.#database.all<PendingEmbeddingRow>(`
      SELECT
        n.row_id,
        n.document_row_id,
        n.text,
        n.content_hash
      FROM document_nodes n
      JOIN documents d ON d.row_id = n.document_row_id
      LEFT JOIN document_node_embedding_state s ON s.node_row_id = n.row_id
      WHERE (s.node_row_id IS NULL OR s.model_id <> ? OR s.content_hash <> n.content_hash)
        AND (? IS NULL OR d.id = ?)
      ORDER BY d.updated_at DESC, n.row_id ASC
      LIMIT ?
    `, [this.#embeddingModel.id, input.documentId ?? null, input.documentId ?? null, limit])

    if (rows.length === 0)
      return 0

    const vectors = await this.#embeddingModel.embedDocuments(rows.map(row => row.text))
    if (vectors.length !== rows.length)
      throw new Error(`Embedding model ${this.#embeddingModel.id} returned ${vectors.length} vectors for ${rows.length} documents`)

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
            BigInt(row.document_row_id),
            serializeVector(vector),
            row.row_id,
            row.content_hash,
          ],
          sql: `
            INSERT OR REPLACE INTO document_node_embeddings (node_row_id, document_row_id, embedding)
            SELECT ?, ?, ?
            WHERE EXISTS (
              SELECT 1 FROM document_nodes WHERE row_id = ? AND content_hash = ?
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
            INSERT INTO document_node_embedding_state (node_row_id, model_id, content_hash)
            SELECT ?, ?, ?
            WHERE EXISTS (
              SELECT 1 FROM document_nodes WHERE row_id = ? AND content_hash = ?
            )
            ON CONFLICT(node_row_id) DO UPDATE SET
              model_id = excluded.model_id,
              content_hash = excluded.content_hash
          `,
        },
      )
    }

    await this.#database.batch(commands)
    return rows.length
  }

  async searchNodes(input: SearchNodesInput): Promise<readonly NodeSearchHit[]> {
    const query = input.query.trim()
    if (query.length === 0)
      return []
    if (input.documentId !== undefined)
      assertNonEmpty(input.documentId, 'Document id')
    const limit = resolveLimit(input.limit, 20, 100)
    const mode = input.mode ?? 'hybrid'
    if (mode !== 'hybrid' && mode !== 'lexical' && mode !== 'semantic')
      throw new TypeError(`Unknown node search mode: ${mode}`)

    if (mode === 'lexical')
      return this.#searchLexically(query, input.documentId, limit)
    if (mode === 'semantic')
      return this.#searchSemantically(query, input.documentId, limit)

    const candidateLimit = Math.min(limit * 4, 100)
    const [lexical, semantic] = await Promise.all([
      this.#searchLexically(query, input.documentId, candidateLimit),
      this.#searchSemantically(query, input.documentId, candidateLimit),
    ])
    return fuseSearchResults(lexical, semantic, limit)
  }

  async #searchLexically(query: string, documentId: string | undefined, limit: number): Promise<readonly NodeSearchHit[]> {
    let rows: readonly NodeSearchRow[]
    const sharedParameters: DatabaseValue[] = [documentId ?? null, documentId ?? null, limit]
    if ([...query].length < 3) {
      rows = await this.#database.all<NodeSearchRow>(`
        SELECT
          d.id AS document_id,
          n.node_id,
          n.parent_node_id,
          n.ordinal,
          n.kind,
          n.text,
          n.attributes_json,
          n.content_hash,
          n.text AS preview,
          0 AS rank
        FROM document_nodes n
        JOIN documents d ON d.row_id = n.document_row_id
        WHERE instr(lower(n.text), lower(?)) > 0
          AND (? IS NULL OR d.id = ?)
        ORDER BY d.updated_at DESC, n.ordinal ASC
        LIMIT ?
      `, [query, ...sharedParameters])
    }
    else {
      rows = await this.#database.all<NodeSearchRow>(`
        SELECT
          d.id AS document_id,
          n.node_id,
          n.parent_node_id,
          n.ordinal,
          n.kind,
          n.text,
          n.attributes_json,
          n.content_hash,
          snippet(document_nodes_fts, 0, '', '', '…', 24) AS preview,
          bm25(document_nodes_fts) AS rank
        FROM document_nodes_fts
        JOIN document_nodes n ON n.row_id = document_nodes_fts.rowid
        JOIN documents d ON d.row_id = n.document_row_id
        WHERE document_nodes_fts MATCH ?
          AND (? IS NULL OR d.id = ?)
        ORDER BY rank ASC
        LIMIT ?
      `, [quoteFtsQuery(query), ...sharedParameters])
    }

    return rows.map(row => ({ ...toStoredNode(row), preview: row.preview, rank: row.rank }))
  }

  async #searchSemantically(query: string, documentId: string | undefined, limit: number): Promise<readonly NodeSearchHit[]> {
    const vector = await this.#embeddingModel.embedQuery(query)
    validateVector(vector, this.#embeddingModel)
    const vectorBytes = serializeVector(vector)

    let rows: readonly NodeSearchRow[]
    if (documentId === undefined) {
      rows = await this.#database.all<NodeSearchRow>(`
        SELECT
          d.id AS document_id,
          n.node_id,
          n.parent_node_id,
          n.ordinal,
          n.kind,
          n.text,
          n.attributes_json,
          n.content_hash,
          n.text AS preview,
          nearest.distance AS rank
        FROM (
          SELECT node_row_id, distance
          FROM document_node_embeddings
          WHERE embedding MATCH ? AND k = ?
        ) nearest
        JOIN document_nodes n ON n.row_id = nearest.node_row_id
        JOIN documents d ON d.row_id = n.document_row_id
        ORDER BY nearest.distance ASC
      `, [vectorBytes, limit])
    }
    else {
      const document = await this.#database.get<{ row_id: number }>(
        'SELECT row_id FROM documents WHERE id = ?',
        [documentId],
      )
      if (!document)
        return []

      rows = await this.#database.all<NodeSearchRow>(`
        SELECT
          d.id AS document_id,
          n.node_id,
          n.parent_node_id,
          n.ordinal,
          n.kind,
          n.text,
          n.attributes_json,
          n.content_hash,
          n.text AS preview,
          nearest.distance AS rank
        FROM (
          SELECT node_row_id, distance
          FROM document_node_embeddings
          WHERE embedding MATCH ? AND k = ? AND document_row_id = ?
        ) nearest
        JOIN document_nodes n ON n.row_id = nearest.node_row_id
        JOIN documents d ON d.row_id = n.document_row_id
        ORDER BY nearest.distance ASC
      `, [vectorBytes, limit, BigInt(document.row_id)])
    }

    return rows.map(row => ({ ...toStoredNode(row), preview: row.preview, rank: row.rank }))
  }
}

export async function createEditorStorage(options: CreateEditorStorageOptions): Promise<EditorStorage> {
  return DefaultEditorStorage.create(options)
}
