import type { EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import type { EditorUserDocumentStorage, SaveUserDocumentInput } from './editor-storage-contracts'

interface UserDocumentRow {
  snapshot: Uint8Array
}

interface EditorUserDocumentRepositoryDependencies {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

function validateDocumentId(documentId: string): void {
  if (documentId.trim().length === 0)
    throw new TypeError('User document id must not be empty')
}

function validateSnapshot(snapshot: Uint8Array): void {
  if (!(snapshot instanceof Uint8Array) || snapshot.byteLength === 0)
    throw new TypeError('User document snapshot must be a non-empty Uint8Array')
}

export class EditorUserDocumentRepository implements EditorUserDocumentStorage {
  readonly #database: EditorStorageDatabase
  readonly #runOperation: StorageOperationRunner

  constructor(dependencies: EditorUserDocumentRepositoryDependencies) {
    this.#database = dependencies.database
    this.#runOperation = dependencies.runOperation
  }

  load(documentId: string): Promise<Uint8Array | null> {
    validateDocumentId(documentId)
    return this.#runOperation(async () => {
      const row = await this.#database.get<UserDocumentRow>(`
        SELECT snapshot
        FROM user_documents
        WHERE document_id = ?
      `, [documentId])
      return row === undefined ? null : new Uint8Array(row.snapshot)
    })
  }

  save(input: SaveUserDocumentInput): Promise<void> {
    validateDocumentId(input.documentId)
    validateSnapshot(input.snapshot)
    const snapshot = new Uint8Array(input.snapshot)
    return this.#runOperation(async () => {
      await this.#database.run(`
        INSERT INTO user_documents (document_id, snapshot, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
          snapshot = excluded.snapshot,
          updated_at = excluded.updated_at
      `, [input.documentId, snapshot, Date.now()])
    })
  }
}
