import type { EditorStorage, EmbeddingModel, StoredNote, TopicBlockProjection } from './index'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteEditorStorage } from './index'
import { SqliteTestDatabase } from './sqlite-test-database'

const embeddingModel: EmbeddingModel = {
  dimensions: 1,
  id: 'test/tasks',
  embedDocuments: async texts => texts.map(() => Float32Array.from([0])),
  embedQuery: async () => Float32Array.from([0]),
}

const storages: EditorStorage[] = []

async function createStorage(): Promise<EditorStorage> {
  const storage = await SqliteEditorStorage.open({
    database: new SqliteTestDatabase(),
    databaseOwnership: 'owned',
    embeddingModel,
  })
  storages.push(storage)
  return storage
}

async function saveTasks(
  storage: EditorStorage,
  note: StoredNote,
  blocks: readonly TopicBlockProjection[],
): Promise<void> {
  await storage.notes.saveNoteUpdates({
    entries: [{
      id: 'topic',
      kind: 'topic',
      mode: 0,
      ordinal: 0,
      parentId: null,
      title: 'Tasks',
      topicType: 'regular',
    }],
    noteId: note.id,
    topics: [{ blocks, title: 'Tasks', topicId: 'topic' }],
    updates: [Uint8Array.from([note.latestSequence + 1])],
  })
}

afterEach(async () => {
  await Promise.all(storages.splice(0).map(storage => storage.close()))
})

describe('todo task projection', () => {
  it('lists task blocks with stable cursor pagination and status filtering', async () => {
    const storage = await createStorage()
    const note = await storage.notes.createNote({ title: 'Project' })
    await saveTasks(storage, note, [
      {
        attributes: { elapsedMs: 0, startedAt: null, status: 'todo' },
        id: 'todo-task',
        kind: 'task',
        ordinal: 0,
        parentId: null,
        text: 'Plan the release',
      },
      {
        attributes: { elapsedMs: 1200, startedAt: 1_700_000_000_000, status: 'doing' },
        id: 'doing-task',
        kind: 'task',
        ordinal: 1,
        parentId: null,
        text: 'Implement the release',
      },
      {
        attributes: { elapsedMs: 5000, startedAt: null, status: 'done' },
        id: 'done-task',
        kind: 'task',
        ordinal: 2,
        parentId: null,
        text: 'Ship the release',
      },
      {
        attributes: { collapsed: false },
        id: 'outline-block',
        kind: 'outline',
        ordinal: 3,
        parentId: null,
        text: 'Not a task',
      },
    ])

    const first = await storage.tasks.list({ limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.items.map(task => task.blockId)).toEqual(['done-task', 'doing-task'])
    expect(first.items[0]).toMatchObject({
      elapsedMs: 5000,
      journalDate: null,
      noteId: note.id,
      noteFavorite: false,
      noteTitle: 'Project',
      startedAt: null,
      status: 'done',
      text: 'Ship the release',
      topicId: 'topic',
      topicTitle: 'Tasks',
    })
    if (first.nextCursor === null)
      throw new Error('Expected a cursor after the first task page')

    const second = await storage.tasks.list({ cursor: first.nextCursor, limit: 2 })
    expect(second.items.map(task => task.blockId)).toEqual(['todo-task'])
    expect(second.nextCursor).toBeNull()

    const doing = await storage.tasks.list({ status: 'doing' })
    expect(doing.items.map(task => task.blockId)).toEqual(['doing-task'])
  })

  it('refreshes the task projection when a CRDT-backed block is removed', async () => {
    const storage = await createStorage()
    const note = await storage.notes.createNote({ title: 'Mutable Project' })
    await saveTasks(storage, note, [{
      attributes: { elapsedMs: 0, startedAt: null, status: 'todo' },
      id: 'task',
      kind: 'task',
      ordinal: 0,
      parentId: null,
      text: 'Remove me',
    }])
    expect((await storage.tasks.list()).items.map(task => task.blockId)).toEqual(['task'])

    await saveTasks(storage, { ...note, latestSequence: 1 }, [])
    expect(await storage.tasks.list()).toMatchObject({ items: [], nextCursor: null })
  })
})
