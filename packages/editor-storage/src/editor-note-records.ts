import type { DatabaseCommand, EditorStorageDatabase } from './database-driver'
import type {
  AssetReferenceProjection,
  CreateInitializedNoteInput,
  NoteWriteReceipt,
  StoredNote,
} from './editor-storage-contracts'
import type { NoteRow, NoteUpdateRow } from './editor-storage-rows'
import { combineLifecycleFailures } from '@memorilo/effect-lifecycle'
import { v7 as createUuidV7 } from 'uuid'
import { planInitializedNoteProjection } from './editor-note-projection-plan'
import { DuplicateNoteTitleError } from './editor-storage-contracts'
import { assertNonEmpty, visibleJournalPredicate } from './editor-storage-shared'
import { validateBinary, validateProjectionPatch } from './editor-storage-validation'

interface PreparedInitializedNote {
  commands: readonly DatabaseCommand[]
  note: StoredNote
}

type NoteKind = 'journal' | 'regular'

const noteRowProjection = `
  note.row_id,
  note.id,
  note.title,
  note.checkpoint_snapshot,
  note.checkpoint_sequence,
  note.latest_sequence,
  note.created_at,
  note.updated_at
`

/** Owns the SQLite record shape and persistence invariants for Notes. */
export class EditorNoteRecords {
  constructor(private readonly database: EditorStorageDatabase) {}

  async assertTitleAvailable(title: string, excludedNoteId?: string): Promise<void> {
    const duplicate = excludedNoteId === undefined
      ? await this.database.get<{ id: string }>(`
          SELECT id
          FROM notes
          WHERE kind = 'regular' AND title = ? COLLATE NOCASE
          LIMIT 1
        `, [title])
      : await this.database.get<{ id: string }>(`
          SELECT id
          FROM notes
          WHERE kind = 'regular'
            AND title = ? COLLATE NOCASE
            AND id <> ?
          LIMIT 1
        `, [title, excludedNoteId])
    if (duplicate)
      throw new DuplicateNoteTitleError(title)
  }

  async checkpoint(
    noteId: string,
    snapshot: Uint8Array,
    throughSequence: number,
  ): Promise<NoteWriteReceipt> {
    const note = await this.requireRow(noteId)
    if (throughSequence < note.checkpoint_sequence || throughSequence > note.latest_sequence) {
      throw new RangeError(
        `Note checkpoint sequence ${throughSequence} is outside ${note.checkpoint_sequence}..${note.latest_sequence}`,
      )
    }

    await this.database.batch([
      {
        parameters: [snapshot, throughSequence, note.row_id],
        sql: `
          UPDATE notes
          SET checkpoint_snapshot = ?, checkpoint_sequence = ?
          WHERE row_id = ?
        `,
      },
      {
        parameters: [note.row_id, throughSequence],
        sql: 'DELETE FROM note_updates WHERE note_row_id = ? AND sequence <= ?',
      },
    ])
    return { acceptedUpdateHashes: [], latestSequence: note.latest_sequence, updatedAt: note.updated_at }
  }

  async create(title: string): Promise<StoredNote> {
    await this.assertTitleAvailable(title)
    const now = Date.now()
    const id = createUuidV7()
    try {
      await this.database.run(`
        INSERT INTO notes (
          id, title, kind, checkpoint_snapshot,
          checkpoint_sequence, latest_sequence, created_at, updated_at
        )
        VALUES (?, ?, 'regular', NULL, 0, 0, ?, ?)
      `, [id, title, now, now])
    }
    catch (error) {
      return this.rethrowTitleConflict(error, title)
    }
    return {
      checkpointSequence: 0,
      createdAt: now,
      id,
      latestSequence: 0,
      snapshot: null,
      title,
      updatedAt: now,
      updates: [],
    }
  }

  async findJournal(journalDate: string): Promise<StoredNote | undefined> {
    const row = await this.database.get<NoteRow>(`
      SELECT ${noteRowProjection}
      FROM journals AS journal
      INNER JOIN notes AS note ON note.row_id = journal.note_row_id
      WHERE journal.journal_date = ?
    `, [journalDate])
    if (!row)
      return undefined
    if (row.title !== journalDate)
      throw new Error(`Journal ${journalDate} has a non-canonical stored Note title`)
    return this.hydrate(row)
  }

  async openMostRecent(today: string | null): Promise<StoredNote> {
    const row = await this.database.get<NoteRow>(`
      SELECT ${noteRowProjection}
      FROM notes AS note
      LEFT JOIN journals AS journal ON journal.note_row_id = note.row_id
      WHERE ${visibleJournalPredicate}
      ORDER BY note.updated_at DESC, note.id DESC
      LIMIT 1
    `, [today, today])
    return row ? this.hydrate(row) : this.create('Untitled')
  }

  prepareInitialized(
    input: CreateInitializedNoteInput,
    now: number,
    kind: NoteKind = 'regular',
  ): PreparedInitializedNote {
    assertNonEmpty(input.id, 'Note id')
    assertNonEmpty(input.title, 'Note title')
    validateBinary(input.snapshot, 'Note snapshot')
    validateProjectionPatch(input.entries, input.topics, input.spreadsheets)

    const entryTopicIds = new Set(input.entries.flatMap(entry => entry.kind === 'topic' ? [entry.id] : []))
    const projectedTopicIds = new Set(input.topics.map(topic => topic.topicId))
    if (entryTopicIds.size !== projectedTopicIds.size
      || [...entryTopicIds].some(topicId => !projectedTopicIds.has(topicId))) {
      throw new Error('An initialized Note must project content for every Topic entry')
    }

    const projection = planInitializedNoteProjection(
      input.id,
      input.entries,
      input.topics,
      input.spreadsheets ?? [],
    )
    const commands: DatabaseCommand[] = [
      {
        parameters: [input.id, input.title, kind, input.snapshot, now, now],
        sql: `
          INSERT INTO notes (
            id, title, kind, checkpoint_snapshot,
            checkpoint_sequence, latest_sequence, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 0, 0, ?, ?)
        `,
      },
      ...projection.commands,
    ]

    return {
      commands,
      note: {
        checkpointSequence: 0,
        createdAt: now,
        id: input.id,
        latestSequence: 0,
        snapshot: new Uint8Array(input.snapshot),
        title: input.title,
        updatedAt: now,
        updates: [],
      },
    }
  }

  async reconcileAssetReferences(
    noteId: string,
    expectedLatestSequence: number,
    references: readonly AssetReferenceProjection[],
    allowedMissingAssetFileNames: readonly string[] = [],
  ): Promise<boolean> {
    const note = await this.database.get<{ latest_sequence: number, row_id: number }>(
      'SELECT row_id, latest_sequence FROM notes WHERE id = ?',
      [noteId],
    )
    if (!note)
      throw new Error(`Unknown Note: ${noteId}`)
    if (note.latest_sequence !== expectedLatestSequence)
      return false

    await this.database.batch(await this.replaceAssetReferenceCommands(
      note.row_id,
      references,
      allowedMissingAssetFileNames,
    ))
    return true
  }

  async replaceAssetReferenceCommands(
    noteRowId: number,
    references: readonly AssetReferenceProjection[],
    allowedMissingAssetFileNames: readonly string[] = [],
  ): Promise<readonly DatabaseCommand[]> {
    const allowedMissing = new Set(allowedMissingAssetFileNames)
    const availableReferences: AssetReferenceProjection[] = []
    for (const reference of references) {
      const asset = await this.database.get<{ deletion_claimed_at: number | null }>(
        'SELECT deletion_claimed_at FROM assets WHERE file_name = ?',
        [reference.fileName],
      )
      if (!asset) {
        if (allowedMissing.has(reference.fileName))
          continue
        throw new Error(`Unknown Asset: ${reference.fileName}`)
      }
      if (asset.deletion_claimed_at !== null)
        throw new Error(`Asset is being reclaimed: ${reference.fileName}`)
      availableReferences.push(reference)
    }

    return [
      {
        parameters: [noteRowId],
        sql: 'DELETE FROM note_asset_references WHERE note_row_id = ?',
      },
      ...availableReferences.map(reference => ({
        parameters: [noteRowId, reference.fileName, reference.count],
        sql: `
          INSERT INTO note_asset_references (note_row_id, asset_file_name, reference_count)
          VALUES (?, ?, ?)
        `,
      })),
    ]
  }

  async rethrowTitleConflict(
    error: unknown,
    title: string,
    excludedNoteId?: string,
  ): Promise<never> {
    try {
      await this.assertTitleAvailable(title, excludedNoteId)
    }
    catch (classificationError) {
      if (classificationError instanceof DuplicateNoteTitleError)
        throw classificationError
      throw combineLifecycleFailures(
        [error, classificationError],
        `Failed to classify the write failure for Note title "${title}"`,
      )
    }
    throw error
  }

  async require(noteId: string): Promise<StoredNote> {
    return this.hydrate(await this.requireRow(noteId))
  }

  async requireRow(noteId: string): Promise<NoteRow> {
    const row = await this.database.get<NoteRow>(`
      SELECT ${noteRowProjection}
      FROM notes AS note
      WHERE note.id = ?
    `, [noteId])
    if (!row)
      throw new Error(`Unknown Note: ${noteId}`)
    return row
  }

  private async hydrate(row: NoteRow): Promise<StoredNote> {
    const updates = row.latest_sequence === row.checkpoint_sequence
      ? []
      : await this.database.all<NoteUpdateRow>(`
          SELECT sequence, update_blob
          FROM note_updates
          WHERE note_row_id = ? AND sequence > ?
          ORDER BY sequence ASC
        `, [row.row_id, row.checkpoint_sequence])

    return {
      checkpointSequence: row.checkpoint_sequence,
      createdAt: row.created_at,
      id: row.id,
      latestSequence: row.latest_sequence,
      snapshot: row.checkpoint_snapshot === null ? null : new Uint8Array(row.checkpoint_snapshot),
      title: row.title,
      updatedAt: row.updated_at,
      updates: updates.map(update => ({
        sequence: update.sequence,
        update: new Uint8Array(update.update_blob),
      })),
    }
  }
}
