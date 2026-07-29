import type Database from 'better-sqlite3'
import type {
  DatabaseCommand,
  DatabaseValue,
  EditorStorageDatabase,
  EmbeddingModel,
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
    return this.#database.prepare(sql).get(...parameters(values)) as Row | undefined
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

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.close()))
})

describe('editor storage with an in-memory SQLite database', () => {
  it('saves and restores a CRDT snapshot and node projection', async () => {
    const storage = await createStorage()
    const opened = await storage.openMostRecentDocument()
    const snapshot = Uint8Array.from([12, 34, 56, 78])

    await storage.saveDocument({
      id: opened.id,
      nodes: [
        {
          attributes: { collapsed: false },
          id: 'parent',
          kind: 'outline',
          ordinal: 0,
          parentId: null,
          text: 'Parent node',
        },
        {
          attributes: { checked: true, priority: 2 },
          id: 'child',
          kind: 'task',
          ordinal: 0,
          parentId: 'parent',
          text: 'Nested searchable text',
        },
      ],
      snapshot,
      title: 'Stored document',
    })

    const restoredDocument = await storage.openMostRecentDocument()
    expect(restoredDocument).toMatchObject({
      id: opened.id,
      snapshot,
      title: 'Stored document',
    })
    expect(await storage.getNode({ documentId: opened.id, nodeId: 'child' })).toEqual({
      attributes: { checked: true, priority: 2 },
      contentHash: '54c92e410c74bcdf209bbab0e56e2da22e6c23b3df58d1890415775ee6443ac8',
      documentId: opened.id,
      id: 'child',
      kind: 'task',
      ordinal: 0,
      parentId: 'parent',
      text: 'Nested searchable text',
    })
  })

  it('removes deleted nodes and refreshes lexical search after saving again', async () => {
    const storage = await createStorage()
    const document = await storage.openMostRecentDocument()
    const initialNodes = [
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
    await storage.saveDocument({
      id: document.id,
      nodes: initialNodes,
      snapshot: Uint8Array.from([1]),
      title: 'Before update',
    })
    expect(await storage.searchNodes({ mode: 'lexical', query: 'pineapple' })).toMatchObject([
      { documentId: document.id, id: 'removed', text: 'Obsolete pineapple note' },
    ])

    await storage.saveDocument({
      id: document.id,
      nodes: [{ ...initialNodes[1], ordinal: 0, text: 'Current searchable database wording' }],
      snapshot: Uint8Array.from([2]),
      title: 'After update',
    })

    expect(await storage.getNode({ documentId: document.id, nodeId: 'removed' })).toBeNull()
    expect(await storage.searchNodes({ mode: 'lexical', query: 'pineapple' })).toEqual([])
    expect(await storage.searchNodes({ mode: 'lexical', query: 'searchable database' })).toMatchObject([
      { documentId: document.id, id: 'changed', text: 'Current searchable database wording' },
    ])
  })

  it('indexes pending nodes and ranks semantic search using sqlite-vec', async () => {
    const storage = await createStorage(semanticEmbeddingModel)
    const document = await storage.openMostRecentDocument()
    const nodes = [
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
    await storage.saveDocument({
      id: document.id,
      nodes,
      snapshot: Uint8Array.from([3]),
      title: 'Semantic document',
    })

    expect(await storage.indexPendingEmbeddings()).toBe(2)
    expect(await storage.indexPendingEmbeddings()).toBe(0)
    const hits = await storage.searchNodes({ limit: 2, mode: 'semantic', query: 'database design' })
    expect(hits.map(hit => hit.id)).toEqual(['database', 'animal'])
    const databaseHit = hits[0]
    const animalHit = hits[1]
    if (!databaseHit || !animalHit)
      throw new Error('Semantic search did not return both indexed nodes')
    expect(databaseHit.rank).toBe(0)
    expect(animalHit.rank).toBeGreaterThan(databaseHit.rank)

    await storage.saveDocument({
      id: document.id,
      nodes: [{ ...nodes[0], text: 'An editor document about a rare animal' }, nodes[1]],
      snapshot: Uint8Array.from([4]),
      title: 'Changed semantic document',
    })
    expect(await storage.indexPendingEmbeddings()).toBe(1)
    expect(await storage.indexPendingEmbeddings()).toBe(0)
  })

  it('fuses lexical and semantic matches without duplicating nodes', async () => {
    const storage = await createStorage(semanticEmbeddingModel)
    const document = await storage.openMostRecentDocument()
    await storage.saveDocument({
      id: document.id,
      nodes: [
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
      ],
      snapshot: Uint8Array.from([5]),
      title: 'Hybrid search document',
    })
    expect(await storage.indexPendingEmbeddings()).toBe(3)

    const hits = await storage.searchNodes({ limit: 2, mode: 'hybrid', query: 'database' })
    expect(hits.map(hit => hit.id)).toEqual(['both', 'semantic-only'])
    expect(new Set(hits.map(hit => hit.id)).size).toBe(2)
  })

  it('finds one and two character lexical queries', async () => {
    const storage = await createStorage()
    const document = await storage.openMostRecentDocument()
    await storage.saveDocument({
      id: document.id,
      nodes: [
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
      ],
      snapshot: Uint8Array.from([6]),
      title: 'Short query document',
    })

    expect((await storage.searchNodes({ mode: 'lexical', query: '数' })).map(hit => hit.id)).toEqual(['matching'])
    expect((await storage.searchNodes({ mode: 'lexical', query: '数据' })).map(hit => hit.id)).toEqual(['matching'])
  })
})
