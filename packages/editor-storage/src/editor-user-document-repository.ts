import type { EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from './database-driver'
import type { EditorUserDocumentStorage, SaveUserDocumentInput } from './editor-storage-contracts'
import { eq } from 'drizzle-orm'
import { userDocuments } from './drizzle-schema'

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
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #runOperation: StorageOperationRunner

  constructor(dependencies: EditorUserDocumentRepositoryDependencies) {
    this.#orm = dependencies.database.drizzle
    this.#runOperation = dependencies.runOperation
  }

  load(documentId: string): Promise<Uint8Array | null> {
    validateDocumentId(documentId)
    return this.#runOperation(async () => {
      const row = this.#orm.select({ snapshot: userDocuments.snapshot })
        .from(userDocuments)
        .where(eq(userDocuments.documentId, documentId))
        .get() as UserDocumentRow | undefined
      return row === undefined ? null : new Uint8Array(row.snapshot)
    })
  }

  save(input: SaveUserDocumentInput): Promise<void> {
    validateDocumentId(input.documentId)
    validateSnapshot(input.snapshot)
    const snapshot = new Uint8Array(input.snapshot)
    return this.#runOperation(async () => {
      this.#orm.insert(userDocuments)
        .values({ documentId: input.documentId, snapshot, updatedAt: Date.now() })
        .onConflictDoUpdate({
          target: userDocuments.documentId,
          set: { snapshot, updatedAt: Date.now() },
        })
        .run()
    })
  }
}
