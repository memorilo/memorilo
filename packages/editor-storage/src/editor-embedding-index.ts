import type { DatabaseCommand, EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from './database-driver'
import type {
  IndexPendingEmbeddingsInput,
  IndexPendingEmbeddingsResult,
} from './editor-storage-contracts'
import type { EmbeddingModel } from './embedding-model'
import { and, asc, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import { notes, topicBlockEmbeddingState, topicBlocks } from './drizzle-schema'
import { assertNonEmpty, resolveLimit } from './editor-storage-shared'
import { topicBlockEmbeddings } from './sqlite-extension-schema'

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
  row_id: number
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
  readonly #orm: EditorStorageDrizzleDatabase

  constructor(
    private readonly database: EditorStorageDatabase,
    private readonly embeddingModel: EmbeddingModel,
    private readonly runOperation: StorageOperationRunner,
  ) {
    this.#orm = database.drizzle
  }

  async indexPendingEmbeddings(input: IndexPendingEmbeddingsInput = {}): Promise<IndexPendingEmbeddingsResult> {
    if (input.noteId !== undefined)
      assertNonEmpty(input.noteId, 'Note id')
    const limit = resolveLimit(input.limit, 32, 256)
    const rows = await this.runOperation(() => Promise.resolve(this.#orm.select({
      row_id: topicBlocks.rowId,
      note_row_id: topicBlocks.noteRowId,
      text: topicBlocks.text,
      content_hash: topicBlocks.contentHash,
    }).from(topicBlocks).innerJoin(notes, eq(notes.rowId, topicBlocks.noteRowId)).leftJoin(topicBlockEmbeddingState, eq(topicBlockEmbeddingState.blockRowId, topicBlocks.rowId)).where(and(
      or(
        isNull(topicBlockEmbeddingState.blockRowId),
        ne(topicBlockEmbeddingState.modelId, this.embeddingModel.id),
        ne(topicBlockEmbeddingState.contentHash, topicBlocks.contentHash),
      ),
      input.noteId === undefined ? undefined : eq(notes.id, input.noteId),
    )).orderBy(desc(notes.updatedAt), asc(topicBlocks.rowId)).limit(limit).all() as PendingEmbeddingRow[]))
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
      commands.push({
        drizzle: (database) => {
          const current = database.select({ rowId: topicBlocks.rowId })
            .from(topicBlocks)
            .where(and(
              eq(topicBlocks.rowId, row.row_id),
              eq(topicBlocks.contentHash, row.content_hash),
            ))
            .get()
          if (!current)
            return
          database.delete(topicBlockEmbeddings)
            .where(eq(topicBlockEmbeddings.blockRowId, row.row_id))
            .run()
          database.insert(topicBlockEmbeddings).values({
            blockRowId: row.row_id,
            embedding: serializeVector(vector),
            noteRowId: row.note_row_id,
          }).run()
          database.insert(topicBlockEmbeddingState).values({
            blockRowId: row.row_id,
            contentHash: row.content_hash,
            modelId: this.embeddingModel.id,
          }).onConflictDoUpdate({
            target: topicBlockEmbeddingState.blockRowId,
            set: {
              contentHash: row.content_hash,
              modelId: this.embeddingModel.id,
            },
          }).run()
        },
      })
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
    const committed = this.#orm.select({
      row_id: topicBlocks.rowId,
      content_hash: topicBlocks.contentHash,
      model_id: topicBlockEmbeddingState.modelId,
      indexed_content_hash: topicBlockEmbeddingState.contentHash,
    }).from(topicBlocks).leftJoin(topicBlockEmbeddingState, eq(topicBlockEmbeddingState.blockRowId, topicBlocks.rowId)).where(inArray(topicBlocks.rowId, rows.map(row => row.row_id))).all() as EmbeddingCommitRow[]
    return committed.filter(row => (
      selected.get(row.row_id) === row.content_hash
      && row.model_id === this.embeddingModel.id
      && row.indexed_content_hash === row.content_hash
    )).length
  }

  private async hasPendingEmbeddings(noteId: string | undefined): Promise<boolean> {
    const row = this.#orm.select({ row_id: topicBlocks.rowId })
      .from(topicBlocks)
      .innerJoin(notes, eq(notes.rowId, topicBlocks.noteRowId))
      .leftJoin(topicBlockEmbeddingState, eq(topicBlockEmbeddingState.blockRowId, topicBlocks.rowId))
      .where(and(
        or(
          isNull(topicBlockEmbeddingState.blockRowId),
          ne(topicBlockEmbeddingState.modelId, this.embeddingModel.id),
          ne(topicBlockEmbeddingState.contentHash, topicBlocks.contentHash),
        ),
        noteId === undefined ? undefined : eq(notes.id, noteId),
      ))
      .limit(1)
      .get() as PendingEmbeddingStatusRow | undefined
    return row !== undefined
  }
}
