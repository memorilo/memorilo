import type { EmbeddingModel, SpreadsheetProjection } from './index'
import { createOperationSupervisor } from '@memorilo/effect-lifecycle'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, describe, expect, it } from 'vitest'

import { DuplicateNoteTitleError, SqliteEditorStorage, SqliteShelfStorage } from './index'
import { SqliteTestDatabase } from './sqlite-test-database'

const embeddingModel: EmbeddingModel = {
  dimensions: 3,
  id: 'test/three-dimensional',
  embedDocuments: async texts => texts.map(() => Float32Array.from([1, 0, 0])),
  embedQuery: async () => Float32Array.from([1, 0, 0]),
}

const databases: SqliteTestDatabase[] = []

class FlakyCloseDatabase extends SqliteTestDatabase {
  closeAttempts = 0

  override async close(): Promise<void> {
    this.closeAttempts += 1
    if (this.closeAttempts === 1)
      throw new Error('Injected database close failure')
    await super.close()
  }
}

async function createStorage(model: EmbeddingModel = embeddingModel) {
  const database = new SqliteTestDatabase()
  databases.push(database)
  return SqliteEditorStorage.open({ database, databaseOwnership: 'owned', embeddingModel: model })
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.close()))
})

describe('editor storage with an in-memory SQLite database', () => {
  it('closes its owned database when startup validation fails', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)

    await expect(SqliteEditorStorage.open({
      database,
      databaseOwnership: 'owned',
      embeddingModel: { ...embeddingModel, dimensions: 0 },
    })).rejects.toThrow('Embedding model dimensions must be a positive integer')

    await expect(database.exec('SELECT 1')).rejects.toThrow('database connection is not open')
  })

  it('does not close a borrowed database when EditorStorage closes', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const storage = await SqliteEditorStorage.open({
      database,
      databaseOwnership: 'borrowed',
      embeddingModel,
    })

    await storage.close()

    await expect(database.exec('SELECT 1')).resolves.toBeUndefined()
  })

  it('serializes borrowed Editor and Shelf owners through one shared database supervisor', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const operations = createOperationSupervisor('shared database test')
    const blockerStarted = deferred<void>()
    const releaseBlocker = deferred<void>()
    let blocker: Promise<void> | undefined
    let editor: SqliteEditorStorage | undefined
    let shelf: SqliteShelfStorage | undefined
    try {
      const currentEditor = await SqliteEditorStorage.open({
        database,
        databaseOwnership: 'borrowed',
        embeddingModel,
        operationSupervisor: operations,
      })
      editor = currentEditor
      const currentShelf = await SqliteShelfStorage.open({
        database,
        databaseOwnership: 'borrowed',
        operationSupervisor: operations,
      })
      shelf = currentShelf
      blocker = operations.run(async () => {
        blockerStarted.resolve()
        await releaseBlocker.promise
      })
      await blockerStarted.promise

      let editorFinished = false
      let shelfFinished = false
      const editorRead = currentEditor.notes.listNoteIds().then(() => {
        editorFinished = true
      })
      const shelfRead = currentShelf.sources.list().then(() => {
        shelfFinished = true
      })
      await Promise.resolve()
      expect(editorFinished).toBe(false)
      expect(shelfFinished).toBe(false)

      releaseBlocker.resolve()
      await blocker
      await Promise.all([editorRead, shelfRead])
    }
    finally {
      releaseBlocker.resolve()
      if (blocker)
        await blocker.catch(() => undefined)
      await shelf?.close()
      await editor?.close()
      await operations.close()
    }
  })

  it('keeps Shelf usable when its borrowed Editor owner closes', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const operations = createOperationSupervisor('shared database test')
    const editor = await SqliteEditorStorage.open({
      database,
      databaseOwnership: 'borrowed',
      embeddingModel,
      operationSupervisor: operations,
    })
    const shelf = await SqliteShelfStorage.open({
      database,
      databaseOwnership: 'borrowed',
      operationSupervisor: operations,
    })

    await editor.close()
    await expect(shelf.sources.list()).resolves.toEqual([])

    await shelf.close()
    await operations.close()
    await expect(database.exec('SELECT 1')).resolves.toBeUndefined()
  })

  it('rejects both borrowed storage owners after the shared supervisor closes', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const operations = createOperationSupervisor('shared database test')
    const editor = await SqliteEditorStorage.open({
      database,
      databaseOwnership: 'borrowed',
      embeddingModel,
      operationSupervisor: operations,
    })
    const shelf = await SqliteShelfStorage.open({
      database,
      databaseOwnership: 'borrowed',
      operationSupervisor: operations,
    })

    await operations.close()
    await expect(editor.notes.listNoteIds()).rejects.toThrow('shared database test is closed')
    await expect(shelf.sources.list()).rejects.toThrow('shared database test is closed')
    await expect(editor.close()).resolves.toBeUndefined()
    await expect(shelf.close()).resolves.toBeUndefined()
  })

  it('does not close a borrowed supervisor when Editor startup fails', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const operations = createOperationSupervisor('shared database test')

    await expect(SqliteEditorStorage.open({
      database,
      databaseOwnership: 'borrowed',
      embeddingModel: { ...embeddingModel, dimensions: 0 },
      operationSupervisor: operations,
    })).rejects.toThrow('Embedding model dimensions must be a positive integer')

    await expect(operations.run(async () => 'still open')).resolves.toBe('still open')
    await operations.close()
  })

  it('closes an owned database after its learning and editor operations drain', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const storage = await SqliteEditorStorage.open({ database, databaseOwnership: 'owned', embeddingModel })

    await storage.close()

    await expect(database.exec('SELECT 1')).rejects.toThrow('database connection is not open')
  })

  it('returns an initialized Note receipt without a fallible read after the commit', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const storage = await SqliteEditorStorage.open({ database, databaseOwnership: 'owned', embeddingModel })
    database.beforeGet = async (sql) => {
      if (sql.includes('checkpoint_snapshot'))
        throw new Error('post-commit read failed')
    }

    const created = await storage.notes.createInitializedNote({
      entries: [],
      id: 'initialized-without-read',
      snapshot: Uint8Array.from([1, 2, 3]),
      title: 'Initialized Note',
      topics: [],
    })

    expect(created).toEqual({
      checkpointSequence: 0,
      createdAt: expect.any(Number),
      id: 'initialized-without-read',
      latestSequence: 0,
      snapshot: Uint8Array.from([1, 2, 3]),
      title: 'Initialized Note',
      updatedAt: created.createdAt,
      updates: [],
    })
  })

  it('stores SpreadsheetTopics in cell-native tables and replaces affected projections', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const storage = await SqliteEditorStorage.open({ database, databaseOwnership: 'owned', embeddingModel })
    const entry = {
      id: 'budget-topic',
      kind: 'topic' as const,
      ordinal: 0,
      parentId: null,
      title: 'Budget',
      topicType: 'spreadsheet' as const,
    }
    const topic = { blocks: [], title: 'Budget', topicId: 'budget-topic' }
    const formulaReferences = [{
      columnId: 'source-column',
      rowId: 'source-row',
      sheetId: 'source-sheet',
      sourceEnd: 21,
      sourceStart: 1,
      topicId: 'source-topic',
    }]
    const initial: SpreadsheetProjection = {
      sheets: [{
        cells: [{
          columnId: 'amount-column',
          display: '42',
          format: { bold: true, kind: 'currency' },
          formulaReferences,
          input: '=\'[Source]Sheet 1\'!A1*2',
          rowId: 'revenue-row',
        }, {
          columnId: 'amount-column',
          display: 'Stale',
          format: {},
          formulaReferences: [],
          input: 'Stale',
          rowId: 'obsolete-row',
        }],
        columnIds: ['label-column', 'amount-column'],
        id: 'summary-sheet',
        name: 'Summary',
        rowIds: ['revenue-row', 'obsolete-row'],
      }],
      topicId: 'budget-topic',
    }

    await storage.notes.createInitializedNote({
      entries: [entry],
      id: 'spreadsheet-note',
      snapshot: Uint8Array.from([1]),
      spreadsheets: [initial],
      title: 'Financial plan',
      topics: [topic],
    })

    await expect(database.all('SELECT sheet_id, ordinal, name FROM spreadsheet_sheets'))
      .resolves
      .toEqual([{ name: 'Summary', ordinal: 0, sheet_id: 'summary-sheet' }])
    await expect(database.all('SELECT row_id, ordinal FROM spreadsheet_rows ORDER BY ordinal'))
      .resolves
      .toEqual([
        { ordinal: 0, row_id: 'revenue-row' },
        { ordinal: 1, row_id: 'obsolete-row' },
      ])
    await expect(database.all('SELECT column_id, ordinal FROM spreadsheet_columns ORDER BY ordinal'))
      .resolves
      .toEqual([
        { column_id: 'label-column', ordinal: 0 },
        { column_id: 'amount-column', ordinal: 1 },
      ])
    await expect(database.all(`
      SELECT sheet_row_id, column_id, input, display, format_json, formula_references_json
      FROM spreadsheet_cells
      ORDER BY sheet_row_id
    `)).resolves.toEqual([
      {
        column_id: 'amount-column',
        display: 'Stale',
        format_json: '{}',
        formula_references_json: '[]',
        input: 'Stale',
        sheet_row_id: 'obsolete-row',
      },
      {
        column_id: 'amount-column',
        display: '42',
        format_json: JSON.stringify({ bold: true, kind: 'currency' }),
        formula_references_json: JSON.stringify(formulaReferences),
        input: '=\'[Source]Sheet 1\'!A1*2',
        sheet_row_id: 'revenue-row',
      },
    ])
    await expect(database.all('SELECT block_id FROM topic_blocks WHERE topic_id = ?', ['budget-topic']))
      .resolves
      .toEqual([])
    await expect(database.all(`
      SELECT input, display
      FROM spreadsheet_cells_fts
      WHERE spreadsheet_cells_fts MATCH 'Source'
    `)).resolves.toEqual([{ display: '42', input: '=\'[Source]Sheet 1\'!A1*2' }])

    await storage.notes.saveNoteUpdates({
      noteId: 'spreadsheet-note',
      spreadsheets: [{
        ...initial,
        sheets: [{
          ...initial.sheets[0]!,
          cells: [{
            columnId: 'amount-column',
            display: '84',
            format: { bold: true },
            formulaReferences: [],
            input: '84',
            rowId: 'revenue-row',
          }],
          rowIds: ['revenue-row'],
        }],
      }],
      topics: [topic],
      updates: [Uint8Array.from([2])],
    })

    await expect(database.all(`
      SELECT sheet_row_id, input, display, format_json
      FROM spreadsheet_cells
    `)).resolves.toEqual([{
      display: '84',
      format_json: JSON.stringify({ bold: true }),
      input: '84',
      sheet_row_id: 'revenue-row',
    }])
    await expect(database.all('SELECT row_id FROM spreadsheet_rows'))
      .resolves
      .toEqual([{ row_id: 'revenue-row' }])
  })

  it('rejects a database whose Topic constraint predates SpreadsheetTopic', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    await database.exec(`
      CREATE TABLE topics (
        row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_type TEXT NOT NULL CHECK (
          topic_type IN ('regular', 'book', 'image-occlusion', 'whiteboard')
        )
      )
    `)

    await expect(SqliteEditorStorage.open({
      database,
      databaseOwnership: 'borrowed',
      embeddingModel,
    })).rejects.toThrow(
      'Unsupported topics schema: SpreadsheetTopic is required; delete the existing database before starting Memorilo',
    )
  })

  it('creates a Journal atomically and returns the existing winner on retries', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const storage = await SqliteEditorStorage.open({ database, databaseOwnership: 'owned', embeddingModel })
    let journalLookupCount = 0
    database.beforeGet = async (sql) => {
      if (sql.includes('FROM journals AS journal')) {
        journalLookupCount += 1
        if (journalLookupCount > 1)
          throw new Error('Journal lookup after commit must not occur')
      }
    }
    const first = await storage.journals.getOrCreate({
      entries: [{
        id: 'journal-topic',
        kind: 'topic',
        mode: 0,
        ordinal: 0,
        parentId: null,
        title: '',
        topicType: 'regular',
      }],
      id: 'journal-note-1',
      journalDate: '2026-08-07',
      snapshot: Uint8Array.from([1, 2, 3]),
      topics: [{ blocks: [], title: '', topicId: 'journal-topic' }],
    })

    expect(first.status).toBe('created')
    expect(first.note.id).toBe('journal-note-1')
    expect(journalLookupCount).toBe(1)

    database.beforeGet = undefined
    await storage.notes.saveNoteUpdates({
      entries: [{
        id: 'journal-topic',
        kind: 'topic',
        mode: 0,
        ordinal: 0,
        parentId: null,
        title: '',
        topicType: 'regular',
      }],
      journalHasUserContent: true,
      noteId: first.note.id,
      title: '2026-08-07',
      topics: [{ blocks: [], title: '', topicId: 'journal-topic' }],
      updates: [Uint8Array.from([4])],
    })
    const second = await storage.journals.getOrCreate({
      entries: [{
        id: 'different-topic',
        kind: 'topic',
        mode: 0,
        ordinal: 0,
        parentId: null,
        title: '',
        topicType: 'regular',
      }],
      id: 'journal-note-2',
      journalDate: '2026-08-07',
      snapshot: Uint8Array.from([9, 9, 9]),
      topics: [{ blocks: [], title: '', topicId: 'different-topic' }],
    })

    expect(second.status).toBe('existing')
    expect(second.note.id).toBe(first.note.id)
    expect(second.note.snapshot).toEqual(first.note.snapshot)
    expect(second.note).toMatchObject({
      latestSequence: 1,
      updates: [{ sequence: 1, update: Uint8Array.from([4]) }],
    })
  })

  it('migrates legacy Journal identity while preserving a regular Note with the same title', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    await database.exec(`
      CREATE TABLE notes (
        row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        checkpoint_snapshot BLOB,
        checkpoint_sequence INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint_sequence >= 0),
        latest_sequence INTEGER NOT NULL DEFAULT 0 CHECK (latest_sequence >= checkpoint_sequence),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE journals (
        note_row_id INTEGER PRIMARY KEY REFERENCES notes(row_id) ON DELETE CASCADE,
        journal_date TEXT NOT NULL UNIQUE,
        has_user_content INTEGER NOT NULL CHECK (has_user_content IN (0, 1))
      );
      INSERT INTO notes (
        id, title, checkpoint_snapshot, checkpoint_sequence, latest_sequence, created_at, updated_at
      ) VALUES
        ('legacy-regular', '2026-08-05', NULL, 0, 0, 1, 1),
        ('legacy-journal', '2026-08-05', NULL, 0, 0, 2, 2);
      INSERT INTO journals (note_row_id, journal_date, has_user_content)
      SELECT row_id, '2026-08-05', 0 FROM notes WHERE id = 'legacy-journal';
    `)

    const storage = await SqliteEditorStorage.open({
      database,
      databaseOwnership: 'borrowed',
      embeddingModel,
    })
    const journal = await storage.journals.getOrCreate({
      entries: [],
      id: 'unused-journal-id',
      journalDate: '2026-08-05',
      snapshot: Uint8Array.from([1]),
      topics: [],
    })

    expect(journal).toMatchObject({ note: { id: 'legacy-journal' }, status: 'existing' })
    await expect(storage.notes.listNotes({ today: '2026-08-05' })).resolves.toMatchObject({ totalItems: 2 })
    await expect(
      storage.notes.createNote({ title: '2026-08-05' }),
    ).rejects.toBeInstanceOf(DuplicateNoteTitleError)
    await storage.close()
  })

  it('resolves concurrent Journal creation to one durable winner', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const firstStorage = await SqliteEditorStorage.open({ database, databaseOwnership: 'borrowed', embeddingModel })
    const secondStorage = await SqliteEditorStorage.open({ database, databaseOwnership: 'borrowed', embeddingModel })
    const input = (id: string, topicId: string) => ({
      entries: [{
        id: topicId,
        kind: 'topic' as const,
        mode: 0 as const,
        ordinal: 0,
        parentId: null,
        title: '',
        topicType: 'regular' as const,
      }],
      id,
      journalDate: '2026-08-06' as const,
      snapshot: Uint8Array.from([1, 2, 3]),
      topics: [{ blocks: [], title: '', topicId }],
    })

    const results = await Promise.all([
      firstStorage.journals.getOrCreate(input('concurrent-journal-1', 'concurrent-topic-1')),
      secondStorage.journals.getOrCreate(input('concurrent-journal-2', 'concurrent-topic-2')),
    ])

    expect(results.map(result => result.status).sort()).toEqual(['created', 'existing'])
    expect(results[0]?.note.id).toBe(results[1]?.note.id)
  })

  it('enforces regular Note title uniqueness across independent storage owners', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const firstStorage = await SqliteEditorStorage.open({
      database,
      databaseOwnership: 'borrowed',
      embeddingModel,
    })
    const secondStorage = await SqliteEditorStorage.open({
      database,
      databaseOwnership: 'borrowed',
      embeddingModel,
    })
    const bothChecksStarted = deferred<void>()
    let titleCheckCount = 0
    database.beforeGet = async (sql) => {
      if (!sql.includes('WHERE kind = \'regular\' AND title'))
        return
      titleCheckCount += 1
      if (titleCheckCount === 2)
        bothChecksStarted.resolve()
      await bothChecksStarted.promise
    }

    const outcomes = await Promise.allSettled([
      firstStorage.notes.createNote({ title: 'Concurrent Title' }),
      secondStorage.notes.createNote({ title: 'concurrent title' }),
    ])
    database.beforeGet = undefined

    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    const failure = outcomes.find(outcome => outcome.status === 'rejected')
    expect(failure?.status === 'rejected' ? failure.reason : null).toBeInstanceOf(DuplicateNoteTitleError)
    await expect(firstStorage.notes.listNotes()).resolves.toMatchObject({ totalItems: 1 })

    await Promise.all([firstStorage.close(), secondStorage.close()])
  })

  it('shares concurrent close calls and drains all owned layers', async () => {
    const storage = await createStorage()
    const first = storage.close()
    expect(storage.close()).toBe(first)
    await first
  })

  it('keeps successful shutdown steps closed while retrying a failed database close', async () => {
    const database = new FlakyCloseDatabase()
    databases.push(database)
    const storage = await SqliteEditorStorage.open({ database, databaseOwnership: 'owned', embeddingModel })

    const first = storage.close()
    expect(storage.close()).toBe(first)
    await expect(first).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'Injected database close failure' }),
      message: 'Failed to close Editor database',
    })
    expect(database.closeAttempts).toBe(1)
    await expect(storage.notes.listNoteIds()).rejects.toThrow('Editor storage is closed')

    await expect(storage.close()).resolves.toBeUndefined()
    expect(database.closeAttempts).toBe(2)
  })

  it('rejects book context reads after the storage lifecycle closes', async () => {
    const storage = await createStorage()
    await storage.close()

    await expect(storage.bookTopics.listByFile({
      format: 'epub',
      sha256: '0'.repeat(64),
    })).rejects.toThrow('Editor storage is closed')
    await expect(
      storage.bookTopics.listByReadingId('reading-id'),
    ).rejects.toThrow('Editor storage is closed')
    await expect(storage.search.getTopicBlock({
      blockId: 'block-id',
      noteId: 'note-id',
      topicId: 'topic-id',
    })).rejects.toThrow('Editor storage is closed')
    await expect(
      storage.search.searchNotes({ query: 'query' }),
    ).rejects.toThrow('Editor storage is closed')
    await expect(
      storage.search.searchTopicBlocks({ query: 'query' }),
    ).rejects.toThrow('Editor storage is closed')
  })

  it('lists BookTopic contexts by file fingerprint and retrieval hint', async () => {
    const storage = await createStorage()
    const sha256 = 'a'.repeat(64)
    await storage.notes.createInitializedNote({
      entries: [{
        book: {
          book: { authors: ['Author'], title: 'Publication' },
          file: {
            byteLength: 42,
            format: 'epub',
            originalName: 'publication.epub',
            sha256,
          },
          retrievalHints: [{ kind: 'local', readingId: 'reading-1' }],
        },
        id: 'book-topic',
        kind: 'topic',
        mode: 0,
        ordinal: 0,
        parentId: null,
        title: 'Book topic',
        topicType: 'book',
      }],
      id: 'book-note',
      snapshot: Uint8Array.from([1]),
      title: 'Book note',
      topics: [{ blocks: [], title: 'Book topic', topicId: 'book-topic' }],
    })

    const byFile = await storage.bookTopics.listByFile({ format: 'epub', sha256 })
    expect(byFile).toHaveLength(1)
    expect(byFile[0]?.noteId).toBe('book-note')
    expect(byFile[0]?.book.file.originalName).toBe('publication.epub')

    const byReadingId = await storage.bookTopics.listByReadingId('reading-1')
    expect(byReadingId).toEqual(byFile)
    await expect(storage.bookTopics.listByFile({ format: 'pdf', sha256 })).resolves.toEqual([])
    await expect(storage.bookTopics.listByReadingId('missing-reading')).resolves.toEqual([])
  })

  it('reconciles BookTopic metadata and blocks when a Topic changes subtype', async () => {
    const storage = await createStorage()
    const sha256 = 'b'.repeat(64)
    await storage.notes.createInitializedNote({
      entries: [{
        id: 'topic',
        kind: 'topic',
        mode: 0,
        ordinal: 0,
        parentId: null,
        title: 'Reading notes',
        topicType: 'regular',
      }],
      id: 'changing-topic-note',
      snapshot: Uint8Array.from([1]),
      title: 'Changing topic',
      topics: [{ blocks: [], title: 'Reading notes', topicId: 'topic' }],
    })

    await storage.notes.saveNoteUpdates({
      entries: [{
        book: {
          book: { authors: ['Author'], title: 'Publication' },
          file: {
            byteLength: 42,
            format: 'epub',
            originalName: 'publication.epub',
            sha256,
          },
          retrievalHints: [{ kind: 'local', readingId: 'reading-1' }],
        },
        id: 'topic',
        kind: 'topic',
        mode: 0,
        ordinal: 0,
        parentId: null,
        title: 'Reading notes',
        topicType: 'book',
      }],
      noteId: 'changing-topic-note',
      topics: [{
        blocks: [{
          attributes: { page: 3 },
          id: 'highlight',
          kind: 'paragraph',
          ordinal: 0,
          parentId: null,
          text: 'Projected book highlight',
        }],
        title: 'Reading notes',
        topicId: 'topic',
      }],
      updates: [Uint8Array.from([2])],
    })

    await expect(storage.bookTopics.listByFile({ format: 'epub', sha256 })).resolves.toMatchObject([
      { noteId: 'changing-topic-note', topicId: 'topic' },
    ])
    await expect(storage.search.getTopicBlock({
      blockId: 'highlight',
      noteId: 'changing-topic-note',
      topicId: 'topic',
    })).resolves.toMatchObject({
      attributes: { page: 3 },
      text: 'Projected book highlight',
    })

    await storage.notes.saveNoteUpdates({
      entries: [{
        id: 'topic',
        kind: 'topic',
        mode: 0,
        ordinal: 0,
        parentId: null,
        title: 'Reading notes',
        topicType: 'regular',
      }],
      noteId: 'changing-topic-note',
      topics: [{ blocks: [], title: 'Reading notes', topicId: 'topic' }],
      updates: [Uint8Array.from([3])],
    })

    await expect(storage.bookTopics.listByFile({ format: 'epub', sha256 })).resolves.toEqual([])
    await expect(storage.bookTopics.listByReadingId('reading-1')).resolves.toEqual([])
    await expect(storage.search.getTopicBlock({
      blockId: 'highlight',
      noteId: 'changing-topic-note',
      topicId: 'topic',
    })).resolves.toBeNull()
  })

  it('reports only newly accepted update hashes for idempotent retries', async () => {
    const storage = await createStorage()
    const created = await storage.notes.createNote({ title: 'Receipts' })
    const update = Uint8Array.from([1, 2, 3])

    const first = await storage.notes.saveNoteUpdates({ noteId: created.id, topics: [], updates: [update, update] })
    const retry = await storage.notes.saveNoteUpdates({ noteId: created.id, topics: [], updates: [update] })

    expect(first.acceptedUpdateHashes).toHaveLength(1)
    expect(first.latestSequence).toBe(1)
    expect(retry).toEqual({ acceptedUpdateHashes: [], latestSequence: 1, updatedAt: first.updatedAt })
  })

  it('commits Note updates and learning Cards in one database batch', async () => {
    const storage = await createStorage()
    const created = await storage.notes.createNote({ title: 'Atomic learning projection' })

    const receipt = await storage.notes.saveNoteUpdates({
      learningCards: [{
        cards: [{
          cardId: 'atomic-card',
          direction: 'forward',
          itemBlockIds: [],
          kind: 'basic',
          sourceBlockId: 'source-block',
        }],
        topicId: 'topic',
        topicOrder: 0,
      }],
      noteId: created.id,
      title: 'Committed with Card',
      topics: [],
      updates: [Uint8Array.from([4, 5, 6])],
    })

    expect(receipt.latestSequence).toBe(1)
    await expect(storage.notes.getNote({ noteId: created.id })).resolves.toMatchObject({
      latestSequence: 1,
      title: 'Committed with Card',
    })
    await expect(storage.learning.cards.listTargets('atomic-card')).resolves.toEqual([
      expect.objectContaining({ active: true, cardId: 'atomic-card' }),
    ])
  })

  it('does not partially commit a Note when learning Card planning fails', async () => {
    const storage = await createStorage()
    const owner = await storage.notes.createNote({ title: 'Card owner' })
    await storage.learning.cards.reconcileTopicCards({
      cards: [{
        cardId: 'owned-card',
        direction: 'forward',
        itemBlockIds: [],
        kind: 'basic',
        sourceBlockId: 'owner-source',
      }],
      noteId: owner.id,
      topicId: 'owner-topic',
      topicOrder: 0,
    })
    const target = await storage.notes.createNote({ title: 'Unchanged Note' })

    await expect(storage.notes.saveNoteUpdates({
      learningCards: [{
        cards: [{
          cardId: 'owned-card',
          direction: 'forward',
          itemBlockIds: [],
          kind: 'basic',
          sourceBlockId: 'conflicting-source',
        }],
        topicId: 'target-topic',
        topicOrder: 0,
      }],
      noteId: target.id,
      title: 'Must not commit',
      topics: [],
      updates: [Uint8Array.from([7, 8, 9])],
    })).rejects.toThrow(`CardID owned-card already belongs to Note ${owner.id}`)

    await expect(storage.notes.getNote({ noteId: target.id })).resolves.toMatchObject({
      latestSequence: 0,
      title: 'Unchanged Note',
      updates: [],
    })
    await expect(storage.notes.listNoteIds()).resolves.toContain(target.id)
  })

  it('moves a Card across projected Topics without deactivating it later in the batch', async () => {
    const storage = await createStorage()
    const note = await storage.notes.createNote({ title: 'Moved Card' })
    const card = {
      cardId: 'moved-card',
      direction: 'forward' as const,
      itemBlockIds: [],
      kind: 'basic' as const,
      sourceBlockId: 'source',
    }
    await storage.learning.cards.reconcileTopicCards({
      cards: [card],
      noteId: note.id,
      topicId: 'old-topic',
      topicOrder: 0,
    })

    await storage.notes.saveNoteUpdates({
      learningCards: [
        { cards: [card], topicId: 'new-topic', topicOrder: 0 },
        { cards: [], topicId: 'old-topic', topicOrder: 1 },
      ],
      noteId: note.id,
      topics: [],
      updates: [Uint8Array.from([10])],
    })

    await expect(storage.learning.cards.listTargets(card.cardId)).resolves.toEqual([
      expect.objectContaining({ active: true, cardId: card.cardId }),
    ])
    await expect(storage.learning.cards.listNoteTopicIds(note.id)).resolves.toEqual(['new-topic'])
  })

  it('atomically grants an asset deletion claim to only one storage instance', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const first = await SqliteEditorStorage.open({ database, databaseOwnership: 'borrowed', embeddingModel })
    const second = await SqliteEditorStorage.open({ database, databaseOwnership: 'borrowed', embeddingModel })
    const fileName = '0f1e2d3c-4b5a-4678-9abc-0d1e2f3a4b5c.png'
    await first.assets.register({
      byteSize: 8,
      createdAt: 1,
      fileName,
      mimeType: 'image/png',
      originalFileName: 'photo.png',
    })

    let waiting = 0
    let release!: () => void
    const bothClaimsReadEligibility = new Promise<void>((resolve) => {
      release = resolve
    })
    database.beforeGet = async (sql) => {
      if (!sql.includes('deletion_claimed_at IS NULL'))
        return
      waiting += 1
      if (waiting === 2)
        release()
      await bothClaimsReadEligibility
    }

    const claims = await Promise.all([
      first.assets.claimUnreferenced({ fileName, unreferencedBefore: 2 }),
      second.assets.claimUnreferenced({ fileName, unreferencedBefore: 2 }),
    ])

    expect(claims.filter(claim => claim !== null)).toHaveLength(1)
  })
})
