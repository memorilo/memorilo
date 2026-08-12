import type { OperationSupervisor } from '@memorilo/effect-lifecycle'
import type { StorageOperationRunner } from './database-driver'
import type {
  CreateEditorStorageOptions,
  EditorAssetStorage,
  EditorBookTopicStorage,
  EditorJournalStorage,
  EditorNoteStorage,
  EditorSearchStorage,
  EditorStorage,
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
  readonly checkpointNote: EditorStorage['checkpointNote']
  readonly claimUnreferencedAsset: EditorStorage['claimUnreferencedAsset']
  readonly completeAssetDeletion: EditorStorage['completeAssetDeletion']
  readonly createInitializedNote: EditorStorage['createInitializedNote']
  readonly createNote: EditorStorage['createNote']
  readonly getAssetStatistics: EditorStorage['getAssetStatistics']
  readonly getNote: EditorStorage['getNote']
  readonly getNoteFavorite: EditorStorage['getNoteFavorite']
  readonly getJournalMetadata: EditorStorage['getJournalMetadata']
  readonly getOrCreateJournal: EditorStorage['getOrCreateJournal']
  readonly getTopicBlock: EditorStorage['getTopicBlock']
  readonly indexPendingEmbeddings: EditorStorage['indexPendingEmbeddings']
  readonly listFavoriteNotes: EditorStorage['listFavoriteNotes']
  readonly listJournalDates: EditorStorage['listJournalDates']
  readonly listNoteIds: EditorStorage['listNoteIds']
  readonly listNotes: EditorStorage['listNotes']
  readonly listPastJournals: EditorStorage['listPastJournals']
  readonly listAssets: EditorStorage['listAssets']
  readonly listBookTopicContextsByFile: EditorStorage['listBookTopicContextsByFile']
  readonly listBookTopicContextsByReadingId: EditorStorage['listBookTopicContextsByReadingId']
  readonly listClaimedAssets: EditorStorage['listClaimedAssets']
  readonly listRecentNotes: EditorStorage['listRecentNotes']
  readonly listUnreferencedAssets: EditorStorage['listUnreferencedAssets']
  readonly openMostRecentNote: EditorStorage['openMostRecentNote']
  readonly prunePastEmptyJournals: EditorStorage['prunePastEmptyJournals']
  readonly reconcileNoteAssetReferences: EditorStorage['reconcileNoteAssetReferences']
  readonly recordNoteOpened: EditorStorage['recordNoteOpened']
  readonly registerAsset: EditorStorage['registerAsset']
  readonly releaseAssetClaim: EditorStorage['releaseAssetClaim']
  readonly saveNoteUpdates: EditorStorage['saveNoteUpdates']
  readonly searchNotes: EditorStorage['searchNotes']
  readonly searchTopicBlocks: EditorStorage['searchTopicBlocks']
  readonly setNoteFavorite: EditorStorage['setNoteFavorite']
  readonly assets: EditorAssetStorage
  readonly bookTopics: EditorBookTopicStorage
  readonly journals: EditorJournalStorage
  readonly learning: LearningStorage
  readonly notes: EditorNoteStorage
  readonly #resources: ReturnType<typeof createResourceScope>
  readonly search: EditorSearchStorage

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
    this.checkpointNote = input => this.notes.checkpointNote(input)
    this.claimUnreferencedAsset = input => this.assets.claimUnreferenced(input)
    this.completeAssetDeletion = input => this.assets.completeDeletion(input)
    this.createInitializedNote = input => this.notes.createInitializedNote(input)
    this.createNote = input => this.notes.createNote(input)
    this.getAssetStatistics = () => this.assets.getStatistics()
    this.getNote = input => this.notes.getNote(input)
    this.getNoteFavorite = input => this.notes.getNoteFavorite(input)
    this.getJournalMetadata = input => this.journals.getMetadata(input)
    this.getOrCreateJournal = input => this.journals.getOrCreate(input)
    this.getTopicBlock = input => this.search.getTopicBlock(input)
    this.indexPendingEmbeddings = async input => (await this.search.indexPendingEmbeddings(input)).indexed
    this.listFavoriteNotes = input => this.notes.listFavoriteNotes(input)
    this.listJournalDates = input => this.journals.listDates(input)
    this.listNoteIds = () => this.notes.listNoteIds()
    this.listNotes = input => this.notes.listNotes(input)
    this.listPastJournals = input => this.journals.listPast(input)
    this.listAssets = () => this.assets.list()
    this.listBookTopicContextsByFile = input => this.bookTopics.listByFile(input)
    this.listBookTopicContextsByReadingId = input => this.bookTopics.listByReadingId(input)
    this.listClaimedAssets = () => this.assets.listClaimed()
    this.listRecentNotes = input => this.notes.listRecentNotes(input)
    this.listUnreferencedAssets = input => this.assets.listUnreferenced(input)
    this.openMostRecentNote = input => this.notes.openMostRecentNote(input)
    this.prunePastEmptyJournals = input => this.journals.prunePastEmpty(input)
    this.reconcileNoteAssetReferences = input => this.notes.reconcileNoteAssetReferences(input)
    this.recordNoteOpened = input => this.notes.recordNoteOpened(input)
    this.registerAsset = input => this.assets.register(input)
    this.releaseAssetClaim = input => this.assets.releaseClaim(input)
    this.saveNoteUpdates = input => this.notes.saveNoteUpdates(input)
    this.searchNotes = input => this.search.searchNotes(input)
    this.searchTopicBlocks = input => this.search.searchTopicBlocks(input)
    this.setNoteFavorite = input => this.notes.setNoteFavorite(input)
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

/** @deprecated Prefer `SqliteEditorStorage.open` with explicit ownership. */
export function createEditorStorage(options: CreateEditorStorageOptions): Promise<SqliteEditorStorage> {
  return SqliteEditorStorage.open({ ...options, databaseOwnership: 'owned' })
}
