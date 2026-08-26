import type { DatabaseCommand, EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import type { EditorNoteRecords } from './editor-note-records'
import type {
  CheckpointNoteInput,
  CreateInitializedNoteInput,
  CreateNoteInput,
  NoteWriteReceipt,
  ReconcileNoteAssetReferencesInput,
  SaveNoteUpdatesInput,
  StoredNote,
} from './editor-storage-contracts'
import type { LearningCardReconciliationPlanner } from './learning/learning-card-reconciliation'
import type { ReadingItemProjection } from './learning/types'
import { validateAssetFileName } from './editor-asset-repository'
import { saveNoteUpdates } from './editor-note-updates'
import { assertNonEmpty } from './editor-storage-shared'
import {
  validateAssetReferences,
  validateBinary,
  validateCompleteLearningProjection,
} from './editor-storage-validation'

interface EditorNoteRepositoryOptions {
  database: EditorStorageDatabase
  planLearningCards: LearningCardReconciliationPlanner
  planReadingItems: (noteId: string, items: readonly ReadingItemProjection[]) => Promise<readonly DatabaseCommand[]>
  records: EditorNoteRecords
  runOperation: StorageOperationRunner
}

export class EditorNoteRepository {
  readonly #options: EditorNoteRepositoryOptions

  constructor(options: EditorNoteRepositoryOptions) {
    this.#options = options
  }

  readonly checkpointNote = (input: CheckpointNoteInput): Promise<NoteWriteReceipt> => {
    assertNonEmpty(input.noteId, 'Note id')
    validateBinary(input.snapshot, 'Note checkpoint snapshot')
    if (!Number.isInteger(input.throughSequence) || input.throughSequence < 0)
      throw new RangeError('Note checkpoint sequence must be a non-negative integer')
    const saved = structuredClone(input)

    return this.#options.runOperation(() => this.#options.records.checkpoint(
      saved.noteId,
      saved.snapshot,
      saved.throughSequence,
    ))
  }

  readonly createInitializedNote = (input: CreateInitializedNoteInput): Promise<StoredNote> => {
    const saved = structuredClone(input)
    return this.#options.runOperation(async () => {
      await this.#options.records.assertTitleAvailable(saved.title)
      if (saved.learningCards !== undefined)
        validateCompleteLearningProjection(saved.entries, saved.learningCards)
      const prepared = this.#options.records.prepareInitialized(saved, Date.now())
      const learningCommands = saved.learningCards === undefined
        ? []
        : await this.#options.planLearningCards({
            noteId: saved.id,
            replaceMissingTopics: true,
            topics: saved.learningCards,
          })
      const readingCommands = saved.learningReadingItems === undefined ? [] : await this.#options.planReadingItems(saved.id, saved.learningReadingItems)
      try {
        await this.#options.database.batch([...prepared.commands, ...learningCommands, ...readingCommands])
      }
      catch (error) {
        return this.#options.records.rethrowTitleConflict(error, saved.title)
      }
      return prepared.note
    })
  }

  readonly reconcileNoteAssetReferences = (input: ReconcileNoteAssetReferencesInput): Promise<boolean> => {
    assertNonEmpty(input.noteId, 'Note id')
    if (!Number.isInteger(input.expectedLatestSequence) || input.expectedLatestSequence < 0)
      throw new RangeError('Expected Note sequence must be a non-negative integer')
    validateAssetReferences(input.references)
    input.allowedMissingAssetFileNames?.forEach(validateAssetFileName)
    const saved = structuredClone(input)
    return this.#options.runOperation(() => this.#options.records.reconcileAssetReferences(
      saved.noteId,
      saved.expectedLatestSequence,
      saved.references,
      saved.allowedMissingAssetFileNames,
    ))
  }

  readonly createNote = (input: CreateNoteInput = {}): Promise<StoredNote> => {
    const title = input.title?.trim() ?? 'Untitled'
    assertNonEmpty(title, 'Note title')
    return this.#options.runOperation(() => this.#options.records.create(title))
  }

  readonly saveNoteUpdates = (input: SaveNoteUpdatesInput): Promise<NoteWriteReceipt> => {
    return saveNoteUpdates({
      database: this.#options.database,
      planLearningCards: this.#options.planLearningCards,
      planReadingItems: (noteId, items) => this.#options.planReadingItems(noteId, items),
      records: this.#options.records,
      runOperation: this.#options.runOperation,
    }, input)
  }
}
