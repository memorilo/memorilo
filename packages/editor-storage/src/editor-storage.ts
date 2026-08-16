import type { OperationSupervisor } from '@memorilo/effect-lifecycle'
import type { StorageOperationRunner } from './database-driver'
import type {
  EditorAssetStorage,
  EditorBookTopicStorage,
  EditorJournalStorage,
  EditorNoteStorage,
  EditorSearchStorage,
  EditorStorage,
  EditorUserDocumentStorage,
  SqliteEditorStorageOptions,
} from './editor-storage-contracts'
import type { LearningStorage } from './learning'
import { createOperationSupervisor, createResourceScope } from '@memorilo/effect-lifecycle'
import { EditorAssetRepository } from './editor-asset-repository'
import { EditorBookTopicContextRepository } from './editor-book-topic-context-repository'
import { EditorJournalRepository } from './editor-journal-repository'
import { EditorNoteLibrary } from './editor-note-library'
import { EditorNoteRecords } from './editor-note-records'
import { EditorNoteRepository } from './editor-note-repository'
import { EditorSearch } from './editor-search'
import { initializeEditorStorageSchema } from './editor-storage-schema'
import { assertJournalDate } from './editor-storage-shared'
import { EditorUserDocumentRepository } from './editor-user-document-repository'
import { SqliteLearningStorage } from './learning/learning-storage'

export { assertJournalDate }

/**
 * Composition root for editor persistence. The public interface is intentionally
 * grouped by domain facet. Concrete repositories stay private; every Editor and
 * Learning facet shares one operation admission. A caller may supply that
 * admission when another storage owner uses the same database; in that mode the
 * application composition root owns shutdown ordering.
 */
export class SqliteEditorStorage implements EditorStorage {
  readonly assets: EditorAssetStorage
  readonly bookTopics: EditorBookTopicStorage
  readonly journals: EditorJournalStorage
  readonly learning: LearningStorage
  readonly notes: EditorNoteStorage
  readonly #resources: ReturnType<typeof createResourceScope>
  readonly search: EditorSearchStorage
  readonly userDocuments: EditorUserDocumentStorage

  private constructor(
    options: SqliteEditorStorageOptions,
    learning: SqliteLearningStorage,
    operations: OperationSupervisor,
    ownsOperations: boolean,
  ) {
    this.#resources = createResourceScope('Editor storage', { closeMode: 'dependent' })
    if (ownsOperations)
      this.#resources.own({ close: () => operations.close(), name: 'Editor operations' })
    if (options.databaseOwnership !== 'borrowed') {
      this.#resources.own({
        close: () => options.database.close(),
        name: 'Editor database',
      })
    }
    this.learning = learning
    const runOperation: StorageOperationRunner = operation => operations.run(operation)
    const records = new EditorNoteRecords(options.database)
    const noteWrites = new EditorNoteRepository({
      database: options.database,
      planLearningCards: input => learning.planCardReconciliation(input),
      records,
      runOperation,
    })
    const noteLibrary = new EditorNoteLibrary({
      database: options.database,
      records,
      runOperation,
    })
    this.notes = { ...noteLibrary, ...noteWrites }
    this.assets = new EditorAssetRepository({ database: options.database, runOperation })
    this.bookTopics = new EditorBookTopicContextRepository({ database: options.database, runOperation })
    this.journals = new EditorJournalRepository({
      database: options.database,
      planLearningCards: input => learning.planCardReconciliation(input),
      records,
      runOperation,
    })
    this.search = new EditorSearch(options.database, options.embeddingModel, runOperation)
    this.userDocuments = new EditorUserDocumentRepository({ database: options.database, runOperation })
    this.#resources.commit()
  }

  static async open(options: SqliteEditorStorageOptions): Promise<SqliteEditorStorage> {
    const startup = createResourceScope('Editor storage startup')
    try {
      const ownedDatabase = options.databaseOwnership === 'borrowed'
        ? null
        : await startup.acquire({
            acquire: () => options.database,
            close: database => database.close(),
            name: 'Editor database',
          })
      const operationResource = options.operationSupervisor === undefined
        ? await startup.acquire({
            acquire: () => createOperationSupervisor('Editor storage'),
            close: supervisor => supervisor.close(),
            name: 'Editor operations',
          })
        : null
      const operations = options.operationSupervisor ?? operationResource!.resource
      const runOperation: StorageOperationRunner = operation => operations.run(operation)
      await operations.run(() => initializeEditorStorageSchema(options.database, options.embeddingModel))
      const learning = await operations.run(() => SqliteLearningStorage.open(
        options.database,
        runOperation,
        options.learningConfiguration,
      ))
      const storage = new SqliteEditorStorage(
        options,
        learning,
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
