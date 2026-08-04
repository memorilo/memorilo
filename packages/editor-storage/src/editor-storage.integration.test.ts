import type Database from 'better-sqlite3'
import type {
  DatabaseCommand,
  DatabaseValue,
  EditorStorage,
  EditorStorageDatabase,
  EmbeddingModel,
  StoredNote,
  TopicBlockProjection,
} from './index'
import BetterSqlite3 from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { afterEach, describe, expect, it } from 'vitest'

import { createEditorStorage } from './index'

function parameters(values: readonly DatabaseValue[] | undefined): readonly DatabaseValue[] {
  return values ?? []
}

class InMemorySqliteDatabase implements EditorStorageDatabase {
  readonly #database: Database.Database
  beforeGet?: (sql: string) => Promise<void>

  constructor() {
    this.#database = new BetterSqlite3(':memory:')
    sqliteVec.load(this.#database)
  }

  async all<Row>(sql: string, values?: readonly DatabaseValue[]): Promise<readonly Row[]> {
    return this.#database.prepare(sql).all(...parameters(values)) as Row[]
  }

  async batch(commands: readonly DatabaseCommand[]): Promise<void> {
    const execute = this.#database.transaction(() => {
      for (const command of commands)
        this.#database.prepare(command.sql).run(...parameters(command.parameters))
    })
    execute()
  }

  async close(): Promise<void> {
    this.#database.close()
  }

  async exec(sql: string): Promise<void> {
    this.#database.exec(sql)
  }

  async get<Row>(sql: string, values?: readonly DatabaseValue[]): Promise<Row | undefined> {
    const row = this.#database.prepare(sql).get(...parameters(values)) as Row | undefined
    await this.beforeGet?.(sql)
    return row
  }

  async run(sql: string, values?: readonly DatabaseValue[]): Promise<void> {
    this.#database.prepare(sql).run(...parameters(values))
  }
}

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

const databases: InMemorySqliteDatabase[] = []

async function createStorage(model: EmbeddingModel = embeddingModel) {
  const database = new InMemorySqliteDatabase()
  databases.push(database)
  return createEditorStorage({ database, embeddingModel: model })
}

async function saveTopic(
  storage: EditorStorage,
  note: StoredNote,
  blocks: readonly TopicBlockProjection[],
  title = 'Stored Note',
): Promise<void> {
  await storage.saveNoteUpdates({
    entries: [{
      id: 'topic',
      kind: 'topic',
      mode: 0,
      ordinal: 0,
      parentId: null,
      title: '',
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

describe('editor storage with an in-memory SQLite database', () => {
  it('atomically grants an asset deletion claim to only one storage instance', async () => {
    const database = new InMemorySqliteDatabase()
    databases.push(database)
    const first = await createEditorStorage({ database, embeddingModel })
    const second = await createEditorStorage({ database, embeddingModel })
    const fileName = '0f1e2d3c-4b5a-4678-9abc-0d1e2f3a4b5c.png'
    await first.registerAsset({
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
      first.claimUnreferencedAsset({ fileName, unreferencedBefore: 2 }),
      second.claimUnreferencedAsset({ fileName, unreferencedBefore: 2 }),
    ])

    expect(claims.filter(claim => claim !== null)).toHaveLength(1)
  })

  it('restores a Note checkpoint, update log, and Topic Block projection', async () => {
    const storage = await createStorage()
    const opened = await storage.openMostRecentNote()
    const snapshot = Uint8Array.from([12, 34, 56, 78])
    await storage.checkpointNote({ noteId: opened.id, snapshot, throughSequence: 0 })

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

    const restored = await storage.openMostRecentNote()
    expect(restored).toMatchObject({
      checkpointSequence: 0,
      id: opened.id,
      latestSequence: 1,
      snapshot,
      title: 'Stored Note',
      updates: [{ sequence: 1, update: Uint8Array.from([1]) }],
    })
    expect(await storage.getTopicBlock({
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

    await storage.checkpointNote({
      noteId: opened.id,
      snapshot: Uint8Array.from([99]),
      throughSequence: 1,
    })
    expect(await storage.openMostRecentNote()).toMatchObject({
      checkpointSequence: 1,
      latestSequence: 1,
      snapshot: Uint8Array.from([99]),
      updates: [],
    })
  })

  it('removes deleted Topic Blocks and refreshes lexical search after saving again', async () => {
    const storage = await createStorage()
    const note = await storage.openMostRecentNote()
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
    expect(await storage.searchTopicBlocks({ mode: 'lexical', query: 'pineapple' })).toMatchObject([
      { id: 'removed', noteId: note.id, text: 'Obsolete pineapple note', topicId: 'topic' },
    ])

    await saveTopic(
      storage,
      { ...note, latestSequence: 1 },
      [{ ...initialBlocks[1], ordinal: 0, text: 'Current searchable database wording' }],
      'After update',
    )

    expect(await storage.getTopicBlock({
      blockId: 'removed',
      noteId: note.id,
      topicId: 'topic',
    })).toBeNull()
    expect(await storage.searchTopicBlocks({ mode: 'lexical', query: 'pineapple' })).toEqual([])
    expect(await storage.searchTopicBlocks({ mode: 'lexical', query: 'searchable database' })).toMatchObject([
      { id: 'changed', noteId: note.id, text: 'Current searchable database wording', topicId: 'topic' },
    ])
  })

  it('indexes pending Topic Blocks and ranks semantic search using sqlite-vec', async () => {
    const storage = await createStorage(semanticEmbeddingModel)
    const note = await storage.openMostRecentNote()
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

    expect(await storage.indexPendingEmbeddings()).toBe(2)
    expect(await storage.indexPendingEmbeddings()).toBe(0)
    const hits = await storage.searchTopicBlocks({ limit: 2, mode: 'semantic', query: 'database design' })
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
    expect(await storage.indexPendingEmbeddings()).toBe(1)
    expect(await storage.indexPendingEmbeddings()).toBe(0)
  })

  it('fuses lexical and semantic matches without duplicating Topic Blocks', async () => {
    const storage = await createStorage(semanticEmbeddingModel)
    const note = await storage.openMostRecentNote()
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
    expect(await storage.indexPendingEmbeddings()).toBe(3)

    const hits = await storage.searchTopicBlocks({ limit: 2, mode: 'hybrid', query: 'database' })
    expect(hits.map(hit => hit.id)).toEqual(['both', 'semantic-only'])
    expect(new Set(hits.map(hit => hit.id)).size).toBe(2)
  })

  it('finds one and two character lexical queries in Topic Blocks', async () => {
    const storage = await createStorage()
    const note = await storage.openMostRecentNote()
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

    expect((await storage.searchTopicBlocks({ mode: 'lexical', query: '数' })).map(hit => hit.id)).toEqual(['matching'])
    expect((await storage.searchTopicBlocks({ mode: 'lexical', query: '数据' })).map(hit => hit.id)).toEqual(['matching'])
  })
})
