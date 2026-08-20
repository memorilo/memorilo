import type { DatabaseCommand, EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import type {
  IndexPendingEmbeddingsInput,
  IndexPendingEmbeddingsResult,
} from './editor-storage-contracts'
import type { EmbeddingModel } from './embedding-model'
import { assertNonEmpty, resolveLimit } from './editor-storage-shared'

interface PendingEmbeddingRow {
  content_hash: string
  note_row_id: number
  row_id: number
  text: string
}

interface EmbeddingCommitRow {
  content_hash: string
  indexed_content_hash: string | null
  model_id: string | null
  row_id: number
}

interface PendingEmbeddingStatusRow {
  has_pending: number
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

/** Owns embedding generation and the stale-content guarded index commit. */
export class EditorEmbeddingIndex {
  constructor(
    private readonly database: EditorStorageDatabase,
    private readonly embeddingModel: EmbeddingModel,
    private readonly runOperation: StorageOperationRunner,
  ) {}

  async indexPendingEmbeddings(input: IndexPendingEmbeddingsInput = {}): Promise<IndexPendingEmbeddingsResult> {
    if (input.noteId !== undefined)
      assertNonEmpty(input.noteId, 'Note id')
    const limit = resolveLimit(input.limit, 32, 256)
    const rows = await this.runOperation(() => this.database.all<PendingEmbeddingRow>(`
        SELECT b.row_id, b.note_row_id, b.text, b.content_hash
        FROM topic_blocks b
        JOIN notes n ON n.row_id = b.note_row_id
        LEFT JOIN topic_block_embedding_state s ON s.block_row_id = b.row_id
        WHERE (s.block_row_id IS NULL OR s.model_id <> ? OR s.content_hash <> b.content_hash)
          AND (? IS NULL OR n.id = ?)
        ORDER BY n.updated_at DESC, b.row_id ASC
        LIMIT ?
      `, [this.embeddingModel.id, input.noteId ?? null, input.noteId ?? null, limit]))
    if (rows.length === 0)
      return { hasPending: false, indexed: 0 }

    // Model inference can take seconds and must not retain the shared database permit.
    const vectors = await this.embeddingModel.embedDocuments(rows.map(row => row.text))
    if (vectors.length !== rows.length)
      throw new Error(`Embedding model ${this.embeddingModel.id} returned ${vectors.length} vectors for ${rows.length} Topic Blocks`)

    const commands: DatabaseCommand[] = []
    for (const [index, row] of rows.entries()) {
      const vector = vectors[index]
      if (!vector)
        throw new Error(`Embedding model ${this.embeddingModel.id} omitted vector ${index}`)
      validateVector(vector, this.embeddingModel)
      commands.push(
        {
          parameters: [BigInt(row.row_id), BigInt(row.note_row_id), serializeVector(vector), row.row_id, row.content_hash],
          sql: `
            INSERT OR REPLACE INTO topic_block_embeddings (block_row_id, note_row_id, embedding)
            SELECT ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM topic_blocks WHERE row_id = ? AND content_hash = ?)
          `,
        },
        {
          parameters: [row.row_id, this.embeddingModel.id, row.content_hash, row.row_id, row.content_hash],
          sql: `
            INSERT INTO topic_block_embedding_state (block_row_id, model_id, content_hash)
            SELECT ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM topic_blocks WHERE row_id = ? AND content_hash = ?)
            ON CONFLICT(block_row_id) DO UPDATE SET
              model_id = excluded.model_id,
              content_hash = excluded.content_hash
          `,
        },
      )
    }
    return this.runOperation(async () => {
      await this.database.batch(commands)
      const [indexed, hasPending] = await Promise.all([
        this.countCommittedEmbeddings(rows),
        this.hasPendingEmbeddings(input.noteId),
      ])
      return { hasPending, indexed }
    })
  }

  async embedQuery(query: string): Promise<Uint8Array> {
    const vector = await this.embeddingModel.embedQuery(query)
    validateVector(vector, this.embeddingModel)
    return serializeVector(vector)
  }

  private async countCommittedEmbeddings(rows: readonly PendingEmbeddingRow[]): Promise<number> {
    const selected = new Map(rows.map(row => [row.row_id, row.content_hash]))
    const placeholders = rows.map(() => '?').join(', ')
    const committed = await this.database.all<EmbeddingCommitRow>(`
      SELECT b.row_id, b.content_hash, s.model_id, s.content_hash AS indexed_content_hash
      FROM topic_blocks b
      LEFT JOIN topic_block_embedding_state s ON s.block_row_id = b.row_id
      WHERE b.row_id IN (${placeholders})
    `, rows.map(row => row.row_id))
    return committed.filter(row => (
      selected.get(row.row_id) === row.content_hash
      && row.model_id === this.embeddingModel.id
      && row.indexed_content_hash === row.content_hash
    )).length
  }

  private async hasPendingEmbeddings(noteId: string | undefined): Promise<boolean> {
    const row = await this.database.get<PendingEmbeddingStatusRow>(`
      SELECT EXISTS (
        SELECT 1
        FROM topic_blocks b
        JOIN notes n ON n.row_id = b.note_row_id
        LEFT JOIN topic_block_embedding_state s ON s.block_row_id = b.row_id
        WHERE (s.block_row_id IS NULL OR s.model_id <> ? OR s.content_hash <> b.content_hash)
          AND (? IS NULL OR n.id = ?)
      ) AS has_pending
    `, [this.embeddingModel.id, noteId ?? null, noteId ?? null])
    return row?.has_pending === 1
  }
}
