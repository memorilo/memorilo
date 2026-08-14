import type { DatabaseCommand, EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import type { EditorNoteRecords } from './editor-note-records'
import type {
  NoteWriteReceipt,
  SaveNoteUpdatesInput,
} from './editor-storage-contracts'
import type {
  ExistingBlockRow,
  ExistingEntryRow,
  ExistingTopicRow,
  JournalMetadataRow,
  NoteUpdateHashRow,
} from './editor-storage-rows'
import type { LearningCardReconciliationPlanner } from './learning/learning-card-reconciliation'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { validateAssetFileName } from './editor-asset-repository'
import { planUpdatedNoteProjection } from './editor-note-projection-plan'
import { assertNonEmpty, readJournalDate } from './editor-storage-shared'
import {
  validateAssetReferences,
  validateBinary,
  validateCompleteLearningProjection,
  validateJournalProjection,
  validateProjectionPatch,
} from './editor-storage-validation'

interface EditorNoteUpdateDependencies {
  database: EditorStorageDatabase
  planLearningCards: LearningCardReconciliationPlanner
  records: EditorNoteRecords
  runOperation: StorageOperationRunner
}

function updateHash(update: Uint8Array): string {
  return bytesToHex(sha256(update))
}

export function saveNoteUpdates(
  dependencies: EditorNoteUpdateDependencies,
  input: SaveNoteUpdatesInput,
): Promise<NoteWriteReceipt> {
  assertNonEmpty(input.noteId, 'Note id')
  if (input.title !== undefined)
    assertNonEmpty(input.title, 'Note title')
  if (input.updates.length === 0)
    throw new TypeError('Note updates must contain at least one update')
  if (input.journalHasUserContent !== undefined && typeof input.journalHasUserContent !== 'boolean')
    throw new TypeError('Journal content state must be a boolean')
  input.updates.forEach((update, index) => validateBinary(update, `Note update ${index}`))
  validateProjectionPatch(input.entries, input.topics, input.spreadsheets)
  if (input.entries !== undefined && input.learningCards !== undefined)
    validateCompleteLearningProjection(input.entries, input.learningCards)
  if (input.assetReferences !== undefined)
    validateAssetReferences(input.assetReferences)
  input.allowedMissingAssetFileNames?.forEach(validateAssetFileName)
  const saved = structuredClone(input)

  return dependencies.runOperation(async () => {
    const note = await dependencies.records.requireRow(saved.noteId)
    const journal = await dependencies.database.get<JournalMetadataRow>(`
        SELECT
          note.id AS note_id,
          journal.journal_date,
          journal.has_user_content
        FROM journals AS journal
        INNER JOIN notes AS note ON note.row_id = journal.note_row_id
        WHERE journal.note_row_id = ?
      `, [note.row_id])
    if (journal) {
      const journalDate = readJournalDate(journal.journal_date, `Stored Journal date for Note ${saved.noteId}`)
      if (note.title !== journalDate)
        throw new Error(`Journal ${journalDate} has a non-canonical stored Note title`)
      if (saved.title !== journalDate)
        throw new TypeError(`Journal ${journalDate} title is immutable`)
      if (saved.journalHasUserContent === undefined)
        throw new TypeError('Journal saves must include their semantic content state')
      validateJournalProjection(saved.entries, saved.topics)
    }
    else if (saved.journalHasUserContent !== undefined) {
      throw new TypeError(`Regular Note ${saved.noteId} cannot persist Journal content state`)
    }
    if (!journal && saved.title !== undefined && saved.title !== note.title)
      await dependencies.records.assertTitleAvailable(saved.title, note.id)

    const updatesByHash = new Map(saved.updates.map(update => [updateHash(update), update]))
    const received = await dependencies.database.all<NoteUpdateHashRow>(
      'SELECT update_hash FROM note_update_receipts WHERE note_row_id = ?',
      [note.row_id],
    )
    const receivedHashes = new Set(received.map(row => row.update_hash))
    const newUpdates = [...updatesByHash]
      .filter(([hash]) => !receivedHashes.has(hash))
      .map(([hash, update]) => ({ hash, update }))
    if (newUpdates.length === 0) {
      const commands: DatabaseCommand[] = []
      if (journal) {
        commands.push({
          parameters: [saved.journalHasUserContent === true ? 1 : 0, note.row_id],
          sql: 'UPDATE journals SET has_user_content = ? WHERE note_row_id = ?',
        })
      }
      if (saved.learningCards !== undefined) {
        commands.push(...await dependencies.planLearningCards({
          noteId: saved.noteId,
          replaceMissingTopics: saved.entries !== undefined,
          topics: saved.learningCards,
        }))
      }
      if (commands.length > 0)
        await dependencies.database.batch(commands)
      return { acceptedUpdateHashes: [], latestSequence: note.latest_sequence, updatedAt: note.updated_at }
    }

    const projection = planUpdatedNoteProjection(
      note.row_id,
      saved.entries,
      saved.topics,
      saved.spreadsheets ?? [],
    )

    const [existingEntries, existingTopics, existingBlocksByTopic] = await Promise.all([
      saved.entries
        ? dependencies.database.all<ExistingEntryRow>(
            'SELECT entry_id FROM note_entries WHERE note_row_id = ?',
            [note.row_id],
          )
        : Promise.resolve([]),
      saved.entries
        ? dependencies.database.all<ExistingTopicRow>(
            'SELECT topic_id FROM topics WHERE note_row_id = ?',
            [note.row_id],
          )
        : Promise.resolve([]),
      Promise.all(saved.topics.map(topic => dependencies.database.all<ExistingBlockRow>(`
          SELECT row_id, topic_id, block_id, content_hash
          FROM topic_blocks
          WHERE note_row_id = ? AND topic_id = ?
        `, [note.row_id, topic.topicId]))),
    ])

    const existingBlocks = existingBlocksByTopic.flat()

    const commands: DatabaseCommand[] = []
    for (const existing of existingBlocks) {
      const next = projection.blocks.get(`${existing.topic_id}\0${existing.block_id}`)
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
      commands.push(...await dependencies.records.replaceAssetReferenceCommands(
        note.row_id,
        saved.assetReferences,
        saved.allowedMissingAssetFileNames,
      ))
    }
    commands.push({
      parameters: [saved.title ?? note.title, latestSequence, now, note.row_id],
      sql: `
          UPDATE notes
          SET title = ?, latest_sequence = ?, updated_at = ?
          WHERE row_id = ?
        `,
    })
    if (journal) {
      commands.push({
        parameters: [saved.journalHasUserContent === true ? 1 : 0, note.row_id],
        sql: 'UPDATE journals SET has_user_content = ? WHERE note_row_id = ?',
      })
    }
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
    commands.push(...projection.commands)
    if (saved.learningCards !== undefined) {
      commands.push(...await dependencies.planLearningCards({
        noteId: saved.noteId,
        replaceMissingTopics: saved.entries !== undefined,
        topics: saved.learningCards,
      }))
    }

    for (const existing of existingBlocks) {
      if (!projection.blocks.has(`${existing.topic_id}\0${existing.block_id}`)) {
        commands.push({
          parameters: [note.row_id, existing.topic_id, existing.block_id],
          sql: 'DELETE FROM topic_blocks WHERE note_row_id = ? AND topic_id = ? AND block_id = ?',
        })
      }
    }
    for (const existing of existingTopics) {
      if (!projection.topicIds.has(existing.topic_id)) {
        commands.push({
          parameters: [note.row_id, existing.topic_id],
          sql: 'DELETE FROM topics WHERE note_row_id = ? AND topic_id = ?',
        })
      }
    }
    for (const existing of existingEntries) {
      if (!projection.entryIds.has(existing.entry_id)) {
        commands.push({
          parameters: [note.row_id, existing.entry_id],
          sql: 'DELETE FROM note_entries WHERE note_row_id = ? AND entry_id = ?',
        })
      }
    }

    try {
      await dependencies.database.batch(commands)
    }
    catch (error) {
      if (!journal && saved.title !== undefined && saved.title !== note.title)
        return dependencies.records.rethrowTitleConflict(error, saved.title, note.id)
      throw error
    }
    return { acceptedUpdateHashes: newUpdates.map(update => update.hash), latestSequence, updatedAt: now }
  })
}
