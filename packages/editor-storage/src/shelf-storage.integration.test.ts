import type { ShelfPage, ShelfSource, ShelfSourceOperation } from '@memorilo/shelf'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteShelfStorage } from './shelf-storage'
import { SqliteTestDatabase } from './sqlite-test-database'

const databases: SqliteTestDatabase[] = []

async function createStorage() {
  const database = new SqliteTestDatabase()
  databases.push(database)
  return SqliteShelfStorage.open({ database, databaseOwnership: 'owned' })
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.close()))
})

describe('shelf storage with an in-memory SQLite database', () => {
  it('commits a source and its initial cached page atomically', async () => {
    const shelf = await createStorage()
    const source: ShelfSource = {
      addedAt: 1,
      auth: 'none',
      enabled: true,
      id: 'source-1',
      kind: 'opds',
      name: 'Test Shelf',
      orderKey: '0000000000001:source-1',
      updatedAt: 1,
      url: 'https://example.test/catalog',
      username: null,
    }
    const page: ShelfPage = {
      navigation: [],
      nextUrl: null,
      publications: [],
      selfUrl: source.url,
      subtitle: null,
      title: source.name,
    }

    const saving = shelf.sources.saveWithPage({
      encryptedPassword: null,
      page: {
        etag: null,
        fetchedAt: 1,
        lastModified: null,
        page,
        sourceId: source.id,
        url: source.url,
      },
      source,
    })
    source.name = 'Mutated after admission'
    page.title = 'Mutated after admission'
    await saving

    await expect(shelf.sources.get(source.id)).resolves.toMatchObject({
      ...source,
      name: 'Test Shelf',
    })
    await expect(shelf.pages.get(source.id, source.url)).resolves.toMatchObject({
      page: { ...page, title: 'Test Shelf' },
    })
    await shelf.close()
  })

  it('rejects an invalid remote merge without partially committing earlier operations', async () => {
    const shelf = await createStorage()
    const complete: ShelfSourceOperation = {
      actorId: 'remote-actor',
      clock: '0000000000001:00000000:remote-actor',
      fields: {
        auth: 'none',
        deleted: false,
        enabled: true,
        name: 'Remote Shelf',
        orderKey: 'remote-1',
        url: 'https://example.test/remote',
        username: null,
      },
      id: 'remote-operation-1',
      sourceId: 'remote-source-1',
    }
    const incomplete: ShelfSourceOperation = {
      actorId: 'remote-actor',
      clock: '0000000000002:00000000:remote-actor',
      fields: { name: 'Incomplete Shelf' },
      id: 'remote-operation-2',
      sourceId: 'remote-source-2',
    }

    await expect(shelf.sources.mergeOperations([complete, incomplete])).rejects.toThrow('cannot create an incomplete source')
    await expect(shelf.sources.get(complete.sourceId)).resolves.toBeNull()
    await shelf.close()
  })

  it('records an undelete operation when a deleted source is saved again', async () => {
    const shelf = await createStorage()
    const source: ShelfSource = {
      addedAt: 1,
      auth: 'none',
      enabled: true,
      id: 'source-to-restore',
      kind: 'opds',
      name: 'Restored Shelf',
      orderKey: 'restored-1',
      updatedAt: 1,
      url: 'https://example.test/restored',
      username: null,
    }

    await shelf.sources.save({ encryptedPassword: null, source })
    await shelf.sources.acknowledgeOperations((await shelf.sources.listPendingOperations()).map(operation => operation.id))
    await shelf.sources.delete(source.id)
    await shelf.sources.acknowledgeOperations((await shelf.sources.listPendingOperations()).map(operation => operation.id))
    await shelf.sources.save({ encryptedPassword: null, source: { ...source, updatedAt: 2 } })

    await expect(shelf.sources.get(source.id)).resolves.toMatchObject({ ...source, updatedAt: 2 })
    await expect(shelf.sources.listPendingOperations()).resolves.toEqual([
      expect.objectContaining({ fields: expect.objectContaining({ deleted: false }), sourceId: source.id }),
    ])
    await shelf.close()
  })
})
