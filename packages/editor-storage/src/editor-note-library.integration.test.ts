import type {
  EditorStorage,
  EmbeddingModel,
} from './index'
import { afterEach, describe, expect, it } from 'vitest'
import { DuplicateNoteTitleError, SqliteEditorStorage } from './index'
import { SqliteTestDatabase } from './sqlite-test-database'

const embeddingModel: EmbeddingModel = {
  dimensions: 3,
  id: 'test/three-dimensional',
  embedDocuments: async texts => texts.map(() => Float32Array.from([1, 0, 0])),
  embedQuery: async () => Float32Array.from([1, 0, 0]),
}

const storages: EditorStorage[] = []

async function createStorage(database = new SqliteTestDatabase()): Promise<{ database: SqliteTestDatabase, storage: EditorStorage }> {
  const storage = await SqliteEditorStorage.open({ database, databaseOwnership: 'owned', embeddingModel })
  storages.push(storage)
  return { database, storage }
}

afterEach(async () => {
  await Promise.all(storages.splice(0).map(storage => storage.close()))
})

describe('editor Note library repository', () => {
  it('creates a regular Note without a fallible post-commit read', async () => {
    const { database, storage } = await createStorage()
    const first = await storage.notes.createNote({ title: 'First Note' })
    expect(first).toMatchObject({ title: 'First Note', snapshot: null, updates: [] })

    database.beforeGet = async (sql) => {
      if (sql.includes('checkpoint_snapshot'))
        throw new Error('regular Note creation must not read after commit')
    }
    const second = await storage.notes.createNote({ title: 'Second Note' })
    expect(second.title).toBe('Second Note')
  })

  it('owns Note listing, favorite state, and recent activity as one behavior surface', async () => {
    const { storage } = await createStorage()
    const note = await storage.notes.createInitializedNote({
      entries: [{
        id: 'topic-1',
        kind: 'topic',
        mode: 0,
        ordinal: 0,
        parentId: null,
        title: 'Topic',
        topicType: 'regular',
      }],
      id: 'note-1',
      snapshot: Uint8Array.from([1]),
      title: 'Library Note',
      topics: [{ blocks: [], title: 'Topic', topicId: 'topic-1' }],
    })

    await storage.notes.setNoteFavorite({ favorite: true, noteId: note.id })
    await storage.notes.recordNoteOpened({ noteId: note.id, topicId: 'topic-1' })

    await expect(storage.notes.listNotes()).resolves.toMatchObject({
      items: [{ favorite: true, id: note.id, title: 'Library Note' }],
      totalItems: 1,
    })
    await expect(storage.notes.listFavoriteNotes()).resolves.toMatchObject([{
      noteId: note.id,
      noteTitle: 'Library Note',
      topicId: 'topic-1',
    }])
    await expect(storage.notes.listRecentNotes()).resolves.toMatchObject([{
      noteId: note.id,
      noteTitle: 'Library Note',
      topicId: 'topic-1',
    }])
  })

  it('enforces case-insensitive regular Note titles across creation and rename', async () => {
    const { storage } = await createStorage()
    const first = await storage.notes.createNote({ title: 'Unique Title' })
    const second = await storage.notes.createNote({ title: 'Another Title' })

    await expect(
      storage.notes.createNote({ title: 'unique title' }),
    ).rejects.toEqual(new DuplicateNoteTitleError('unique title'))
    await expect(storage.notes.saveNoteUpdates({
      noteId: second.id,
      title: 'UNIQUE TITLE',
      topics: [],
      updates: [Uint8Array.from([1])],
    })).rejects.toEqual(new DuplicateNoteTitleError('UNIQUE TITLE'))

    await expect(storage.notes.getNote({ noteId: first.id })).resolves.toMatchObject({ title: 'Unique Title' })
    await expect(storage.notes.getNote({ noteId: second.id })).resolves.toMatchObject({
      latestSequence: 0,
      title: 'Another Title',
    })
  })

  it('replaces Asset references only at the expected Note sequence', async () => {
    const { storage } = await createStorage()
    const note = await storage.notes.createNote({ title: 'Asset references' })
    const fileName = 'abcdef.png'
    await storage.assets.register({
      byteSize: 4,
      createdAt: 1,
      fileName,
      mimeType: 'image/png',
      originalFileName: 'image.png',
    })

    const receipt = await storage.notes.saveNoteUpdates({
      assetReferences: [{ count: 2, fileName }],
      noteId: note.id,
      topics: [],
      updates: [Uint8Array.from([1])],
    })
    await expect(storage.assets.getStatistics()).resolves.toEqual({
      managedAssetCount: 1,
      referenceCount: 2,
    })

    await expect(storage.notes.reconcileNoteAssetReferences({
      expectedLatestSequence: 0,
      noteId: note.id,
      references: [],
    })).resolves.toBe(false)
    await expect(storage.assets.getStatistics()).resolves.toMatchObject({ referenceCount: 2 })

    await expect(storage.notes.reconcileNoteAssetReferences({
      expectedLatestSequence: receipt.latestSequence,
      noteId: note.id,
      references: [],
    })).resolves.toBe(true)
    await expect(storage.assets.getStatistics()).resolves.toMatchObject({ referenceCount: 0 })
  })
})
