import type {
  EditorStorage,
  EmbeddingModel,
  StoredNote,
  TopicBlockProjection,
} from './index'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteEditorStorage } from './index'
import { SqliteTestDatabase } from './sqlite-test-database'

const embeddingModel: EmbeddingModel = {
  dimensions: 3,
  id: 'test/three-dimensional',
  embedDocuments: async texts => texts.map(() => Float32Array.from([1, 0, 0])),
  embedQuery: async () => Float32Array.from([1, 0, 0]),
}

function semanticVector(text: string): Float32Array {
  const normalized = text.toLowerCase()
  return Float32Array.from([
    normalized.includes('animal') || normalized.includes('panda') ? 1 : 0,
    normalized.includes('database') || normalized.includes('sqlite') ? 1 : 0,
    normalized.includes('editor') || normalized.includes('document') ? 1 : 0,
  ])
}

const semanticEmbeddingModel: EmbeddingModel = {
  dimensions: 3,
  id: 'test/semantic-keywords',
  embedDocuments: async texts => texts.map(semanticVector),
  embedQuery: async text => semanticVector(text),
}

const databases: SqliteTestDatabase[] = []

async function createStorage(model: EmbeddingModel = embeddingModel) {
  const database = new SqliteTestDatabase()
  databases.push(database)
  return SqliteEditorStorage.open({ database, databaseOwnership: 'owned', embeddingModel: model })
}

async function saveTopic(
  storage: EditorStorage,
  note: StoredNote,
  blocks: readonly TopicBlockProjection[],
  title = 'Stored Note',
): Promise<void> {
  await storage.notes.saveNoteUpdates({
    entries: [{
      id: 'topic',
      kind: 'topic',
      mode: 0,
      ordinal: 0,
      parentId: null,
      title: '',
      topicType: 'regular',
    }],
    noteId: note.id,
    title,
    topics: [{
      blocks,
      title: '',
      topicId: 'topic',
    }],
    updates: [Uint8Array.from([note.latestSequence + 1])],
  })
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.close()))
})

describe('editor search with an in-memory SQLite database', () => {
  it('restores a Note checkpoint, update log, and Topic Block projection', async () => {
    const storage = await createStorage()
    const opened = await storage.notes.openMostRecentNote()
    const snapshot = Uint8Array.from([12, 34, 56, 78])
    await storage.notes.checkpointNote({ noteId: opened.id, snapshot, throughSequence: 0 })

    await saveTopic(storage, opened, [
      {
        attributes: { collapsed: false },
        id: 'parent',
        kind: 'outline',
        ordinal: 0,
        parentId: null,
        text: 'Parent block',
      },
      {
        attributes: { checked: true, priority: 2 },
        id: 'child',
        kind: 'task',
        ordinal: 0,
        parentId: 'parent',
        text: 'Nested searchable text',
      },
    ])

    const restored = await storage.notes.openMostRecentNote()
    expect(restored).toMatchObject({
      checkpointSequence: 0,
      id: opened.id,
      latestSequence: 1,
      snapshot,
      title: 'Stored Note',
      updates: [{ sequence: 1, update: Uint8Array.from([1]) }],
    })
    expect(await storage.search.getTopicBlock({
      blockId: 'child',
      noteId: opened.id,
      topicId: 'topic',
    })).toEqual({
      attributes: { checked: true, priority: 2 },
      contentHash: '54c92e410c74bcdf209bbab0e56e2da22e6c23b3df58d1890415775ee6443ac8',
      id: 'child',
      kind: 'task',
      noteId: opened.id,
      ordinal: 0,
      parentId: 'parent',
      text: 'Nested searchable text',
      topicId: 'topic',
    })

    await storage.notes.checkpointNote({
      noteId: opened.id,
      snapshot: Uint8Array.from([99]),
      throughSequence: 1,
    })
    expect(await storage.notes.openMostRecentNote()).toMatchObject({
      checkpointSequence: 1,
      latestSequence: 1,
      snapshot: Uint8Array.from([99]),
      updates: [],
    })
  })

  it('removes deleted Topic Blocks and refreshes lexical search after saving again', async () => {
    const storage = await createStorage()
    const note = await storage.notes.openMostRecentNote()
    const initialBlocks = [
      {
        attributes: {},
        id: 'removed',
        kind: 'outline',
        ordinal: 0,
        parentId: null,
        text: 'Obsolete pineapple note',
      },
      {
        attributes: {},
        id: 'changed',
        kind: 'outline',
        ordinal: 1,
        parentId: null,
        text: 'Old database wording',
      },
    ] as const
    await saveTopic(storage, note, initialBlocks, 'Before update')
    expect(await storage.search.searchTopicBlocks({ mode: 'lexical', query: 'pineapple' })).toMatchObject([
      { id: 'removed', noteId: note.id, text: 'Obsolete pineapple note', topicId: 'topic' },
    ])

    await saveTopic(
      storage,
      { ...note, latestSequence: 1 },
      [{ ...initialBlocks[1], ordinal: 0, text: 'Current searchable database wording' }],
      'After update',
    )

    expect(await storage.search.getTopicBlock({
      blockId: 'removed',
      noteId: note.id,
      topicId: 'topic',
    })).toBeNull()
    expect(await storage.search.searchTopicBlocks({ mode: 'lexical', query: 'pineapple' })).toEqual([])
    expect(await storage.search.searchTopicBlocks({ mode: 'lexical', query: 'searchable database' })).toMatchObject([
      { id: 'changed', noteId: note.id, text: 'Current searchable database wording', topicId: 'topic' },
    ])
  })

  it('indexes pending Topic Blocks and ranks semantic search using sqlite-vec', async () => {
    const storage = await createStorage(semanticEmbeddingModel)
    const note = await storage.notes.openMostRecentNote()
    const blocks = [
      {
        attributes: {},
        id: 'animal',
        kind: 'outline',
        ordinal: 0,
        parentId: null,
        text: 'A red panda is a rare animal',
      },
      {
        attributes: {},
        id: 'database',
        kind: 'outline',
        ordinal: 1,
        parentId: null,
        text: 'SQLite database indexing architecture',
      },
    ] as const
    await saveTopic(storage, note, blocks, 'Semantic Note')

    expect(await storage.search.indexPendingEmbeddings()).toEqual({ hasPending: false, indexed: 2 })
    expect(await storage.search.indexPendingEmbeddings()).toEqual({ hasPending: false, indexed: 0 })
    const hits = await storage.search.searchTopicBlocks({ limit: 2, mode: 'semantic', query: 'database design' })
    expect(hits.map(hit => hit.id)).toEqual(['database', 'animal'])
    const databaseHit = hits[0]
    const animalHit = hits[1]
    if (!databaseHit || !animalHit)
      throw new Error('Semantic search did not return both indexed Topic Blocks')
    expect(databaseHit.rank).toBe(0)
    expect(animalHit.rank).toBeGreaterThan(databaseHit.rank)

    await saveTopic(
      storage,
      { ...note, latestSequence: 1 },
      [{ ...blocks[0], text: 'An editor document about a rare animal' }, blocks[1]],
      'Changed Semantic Note',
    )
    expect(await storage.search.indexPendingEmbeddings()).toEqual({ hasPending: false, indexed: 1 })
    expect(await storage.search.indexPendingEmbeddings()).toEqual({ hasPending: false, indexed: 0 })
  })

  it('leaves a Topic Block pending when its content changes during embedding generation', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    const embeddingStarted = deferred<void>()
    const releaseEmbedding = deferred<void>()
    const model: EmbeddingModel = {
      ...semanticEmbeddingModel,
      embedDocuments: async (texts) => {
        embeddingStarted.resolve()
        await releaseEmbedding.promise
        return texts.map(semanticVector)
      },
    }
    const first = await SqliteEditorStorage.open({ database, databaseOwnership: 'borrowed', embeddingModel: model })
    const second = await SqliteEditorStorage.open({ database, databaseOwnership: 'borrowed', embeddingModel: model })
    const note = await first.notes.openMostRecentNote()
    const block = {
      attributes: {},
      id: 'changing',
      kind: 'outline',
      ordinal: 0,
      parentId: null,
      text: 'Original database text',
    } as const
    await saveTopic(first, note, [block], 'Changing Semantic Note')

    const indexing = first.search.indexPendingEmbeddings({ noteId: note.id })
    await embeddingStarted.promise
    await saveTopic(
      second,
      { ...note, latestSequence: 1 },
      [{ ...block, text: 'Current editor document text' }],
      'Changed During Embedding',
    )
    releaseEmbedding.resolve()

    await expect(indexing).resolves.toEqual({ hasPending: true, indexed: 0 })
    await expect(first.search.indexPendingEmbeddings({ noteId: note.id })).resolves.toEqual({
      hasPending: false,
      indexed: 1,
    })
    await Promise.all([first.close(), second.close()])
  })

  it('does not partially commit a batch when the embedding model returns an invalid vector', async () => {
    let returnInvalidVector = true
    const model: EmbeddingModel = {
      dimensions: 3,
      id: 'test/invalid-batch-vector',
      embedDocuments: async texts => texts.map((text, index) => (
        returnInvalidVector && index === 1
          ? Float32Array.from([Number.NaN, 0, 0])
          : semanticVector(text)
      )),
      embedQuery: async text => semanticVector(text),
    }
    const storage = await createStorage(model)
    const note = await storage.notes.openMostRecentNote()
    await saveTopic(storage, note, [
      {
        attributes: {},
        id: 'first',
        kind: 'outline',
        ordinal: 0,
        parentId: null,
        text: 'Database query planning',
      },
      {
        attributes: {},
        id: 'second',
        kind: 'outline',
        ordinal: 1,
        parentId: null,
        text: 'Editor document structure',
      },
    ], 'Atomic Embedding Note')

    await expect(storage.search.indexPendingEmbeddings()).rejects.toThrow('returned a non-finite value')
    await expect(storage.search.searchTopicBlocks({ mode: 'semantic', query: 'database' })).resolves.toEqual([])

    returnInvalidVector = false
    await expect(storage.search.indexPendingEmbeddings()).resolves.toEqual({ hasPending: false, indexed: 2 })
  })

  it('drains admitted embedding generation before closing the storage database', async () => {
    const embeddingStarted = deferred<void>()
    const releaseEmbedding = deferred<void>()
    const model: EmbeddingModel = {
      ...semanticEmbeddingModel,
      embedDocuments: async (texts) => {
        embeddingStarted.resolve()
        await releaseEmbedding.promise
        return texts.map(semanticVector)
      },
    }
    const storage = await createStorage(model)
    const note = await storage.notes.openMostRecentNote()
    await saveTopic(storage, note, [{
      attributes: {},
      id: 'drained',
      kind: 'outline',
      ordinal: 0,
      parentId: null,
      text: 'Database indexing must drain',
    }], 'Drained Embedding Note')

    const indexing = storage.search.indexPendingEmbeddings()
    await embeddingStarted.promise
    let closed = false
    const close = storage.close().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)

    releaseEmbedding.resolve()
    await expect(indexing).resolves.toEqual({ hasPending: false, indexed: 1 })
    await close
    await expect(storage.search.indexPendingEmbeddings()).rejects.toThrow('Editor storage is closed')
  })

  it('fuses lexical and semantic matches without duplicating Topic Blocks', async () => {
    const storage = await createStorage(semanticEmbeddingModel)
    const note = await storage.notes.openMostRecentNote()
    await saveTopic(storage, note, [
      {
        attributes: {},
        id: 'both',
        kind: 'outline',
        ordinal: 0,
        parentId: null,
        text: 'Database query performance',
      },
      {
        attributes: {},
        id: 'semantic-only',
        kind: 'outline',
        ordinal: 1,
        parentId: null,
        text: 'SQLite storage engine',
      },
      {
        attributes: {},
        id: 'unrelated',
        kind: 'outline',
        ordinal: 2,
        parentId: null,
        text: 'A red panda is an animal',
      },
    ], 'Hybrid Search Note')
    expect(await storage.search.indexPendingEmbeddings()).toEqual({ hasPending: false, indexed: 3 })

    const hits = await storage.search.searchTopicBlocks({ limit: 2, mode: 'hybrid', query: 'database' })
    expect(hits.map(hit => hit.id)).toEqual(['both', 'semantic-only'])
    expect(new Set(hits.map(hit => hit.id)).size).toBe(2)
  })

  it('finds one and two character lexical queries in Topic Blocks', async () => {
    const storage = await createStorage()
    const note = await storage.notes.openMostRecentNote()
    await saveTopic(storage, note, [
      {
        attributes: {},
        id: 'matching',
        kind: 'outline',
        ordinal: 0,
        parentId: null,
        text: '数据库设计',
      },
      {
        attributes: {},
        id: 'other',
        kind: 'outline',
        ordinal: 1,
        parentId: null,
        text: '编辑器交互',
      },
    ], 'Short Query Note')

    expect((await storage.search.searchTopicBlocks({ mode: 'lexical', query: '数' })).map(hit => hit.id)).toEqual(['matching'])
    expect((await storage.search.searchTopicBlocks({ mode: 'lexical', query: '数据' })).map(hit => hit.id)).toEqual(['matching'])
  })
})
