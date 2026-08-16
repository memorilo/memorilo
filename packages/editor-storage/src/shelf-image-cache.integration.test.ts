import type { CachedShelfAsset } from '@memorilo/shelf'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteShelfImageCache } from './shelf-image-cache'
import { SqliteTestDatabase } from './sqlite-test-database'

const caches: SqliteShelfImageCache[] = []
const databases: SqliteTestDatabase[] = []

function image(
  sourceId: string,
  name: string,
  bytes: readonly number[] = [1, 2, 3],
): CachedShelfAsset {
  return {
    bytes: new Uint8Array(bytes),
    etag: null,
    fetchedAt: 1,
    lastModified: null,
    mimeType: 'image/png',
    sourceId,
    url: `https://example.test/${name}.png`,
  }
}

async function openCache(maximumBytes = 1024) {
  const database = new SqliteTestDatabase()
  databases.push(database)
  const cache = await SqliteShelfImageCache.open({ database, maximumBytes })
  caches.push(cache)
  return { cache, database }
}

afterEach(async () => {
  await Promise.all(caches.splice(0).map(cache => cache.close()))
  await Promise.all(databases.splice(0).map(database => database.close()))
})

describe('sqlite shelf image cache', () => {
  it('owns queued input bytes and returns independent snapshots', async () => {
    const { cache } = await openCache()
    const input = image('source-1', 'cover')

    const saving = cache.save(input)
    input.bytes[0] = 9
    await saving

    const first = await cache.get(input.sourceId, input.url)
    expect([...first!.bytes]).toEqual([1, 2, 3])
    first!.bytes[0] = 8
    await expect(cache.get(input.sourceId, input.url)).resolves.toMatchObject({
      bytes: new Uint8Array([1, 2, 3]),
    })
  })

  it('retains recently accessed images when pruning to the byte budget', async () => {
    const { cache } = await openCache(6)
    const first = image('source-1', 'first')
    const second = image('source-1', 'second')
    const third = image('source-1', 'third')

    await cache.save(first)
    await cache.save(second)
    await cache.get(first.sourceId, first.url)
    await cache.save(third)

    await expect(cache.get(first.sourceId, first.url)).resolves.not.toBeNull()
    await expect(cache.get(second.sourceId, second.url)).resolves.toBeNull()
    await expect(cache.get(third.sourceId, third.url)).resolves.not.toBeNull()
  })

  it('deletes only images owned by the requested source', async () => {
    const { cache } = await openCache()
    const first = image('source-1', 'cover')
    const second = image('source-2', 'cover')
    await cache.save(first)
    await cache.save(second)

    await cache.deleteSource(first.sourceId)

    await expect(cache.get(first.sourceId, first.url)).resolves.toBeNull()
    await expect(cache.get(second.sourceId, second.url)).resolves.not.toBeNull()
  })

  it('drains an accepted read, shares close, and rejects later admission', async () => {
    const { cache, database } = await openCache()
    const input = image('source-1', 'cover')
    await cache.save(input)
    const readStarted = deferred()
    const releaseRead = deferred()
    database.beforeGet = async (sql) => {
      if (!sql.includes('FROM shelf_assets'))
        return
      readStarted.resolve()
      await releaseRead.promise
    }

    const read = cache.get(input.sourceId, input.url)
    await readStarted.promise
    const closing = cache.close()

    try {
      expect(cache.close()).toBe(closing)
      await expect(cache.get(input.sourceId, input.url)).rejects.toThrow('Shelf image cache is closed')
      await expect(cache.deleteSource(input.sourceId)).rejects.toThrow('Shelf image cache is closed')
      await expect(cache.save(input)).rejects.toThrow('Shelf image cache is closed')
    }
    finally {
      releaseRead.resolve()
    }
    await expect(read).resolves.not.toBeNull()
    await expect(closing).resolves.toBeUndefined()
  })
})
