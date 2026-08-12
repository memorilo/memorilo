import type { OperationSupervisor } from '@memorilo/effect-lifecycle'
import type { ShelfPageStorage, ShelfSourceStorage, ShelfStorage } from '@memorilo/shelf'
import type { EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import { createOperationSupervisor, createResourceScope } from '@memorilo/effect-lifecycle'
import { ShelfPageCacheRepository } from './shelf-page-cache-repository'
import { ShelfSourceRepository } from './shelf-source-repository'
import { initializeShelfStorage } from './shelf-storage-schema'

export interface SqliteShelfStorageOptions {
  database: EditorStorageDatabase
  /** The caller must explicitly declare whether this storage closes the database. */
  databaseOwnership: 'borrowed' | 'owned'
  /** Shared database admission borrowed from the composition root. */
  operationSupervisor?: OperationSupervisor
}

/** SQLite adapter that participates in one admission/drain lifecycle for every Shelf facet. */
export class SqliteShelfStorage implements ShelfStorage {
  readonly #resources: ReturnType<typeof createResourceScope>
  readonly #operations: OperationSupervisor
  readonly pages: ShelfPageStorage
  readonly sources: ShelfSourceStorage

  private constructor(
    database: EditorStorageDatabase,
    databaseOwnership: 'borrowed' | 'owned',
    operations: OperationSupervisor,
    ownsOperations: boolean,
  ) {
    this.#resources = createResourceScope('Shelf storage', { closeMode: 'dependent' })
    this.#operations = operations
    if (ownsOperations) {
      this.#resources.own({
        close: () => this.#operations.close(),
        name: 'Shelf operations',
      })
    }
    if (databaseOwnership === 'owned') {
      this.#resources.own({
        close: () => database.close(),
        name: 'Shelf database',
      })
    }
    const runOperation: StorageOperationRunner = operation => this.#operations.run(operation)
    this.pages = new ShelfPageCacheRepository({ database, runOperation })
    this.sources = new ShelfSourceRepository(database, runOperation)
    this.#resources.commit()
  }

  static async open(options: SqliteShelfStorageOptions): Promise<SqliteShelfStorage> {
    const startup = createResourceScope('Shelf storage startup')
    try {
      const ownedDatabase = options.databaseOwnership === 'owned'
        ? await startup.acquire({
            acquire: () => options.database,
            close: database => database.close(),
            name: 'Shelf database',
          })
        : null
      const database = ownedDatabase?.resource ?? options.database
      const operationResource = options.operationSupervisor === undefined
        ? await startup.acquire({
            acquire: () => createOperationSupervisor('Shelf storage'),
            close: operations => operations.close(),
            name: 'Shelf operations',
          })
        : null
      const operations = options.operationSupervisor ?? operationResource!.resource
      await operations.run(() => initializeShelfStorage(database))
      const storage = new SqliteShelfStorage(
        database,
        options.databaseOwnership,
        operations,
        operationResource !== null,
      )
      ownedDatabase?.transfer()
      operationResource?.transfer()
      await startup.close()
      return storage
    }
    catch (error) {
      return startup.rollback(error)
    }
  }

  close(): Promise<void> {
    return this.#resources.close()
  }
}
