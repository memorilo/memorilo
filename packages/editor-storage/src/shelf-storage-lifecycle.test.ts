import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'
import { SqliteShelfStorage } from './shelf-storage'
import { SqliteTestDatabase } from './sqlite-test-database'

class BlockingShelfDatabase extends SqliteTestDatabase {
  readonly readStarted = deferred()
  readonly releaseRead = deferred()
  readonly closeSpy = vi.fn(async () => {})
  failSchema = false

  constructor() {
    super()
    this.beforeGet = async () => {
      this.readStarted.resolve()
      await this.releaseRead.promise
    }
  }

  override async close(): Promise<void> {
    await this.closeSpy()
    await super.close()
  }

  override migrate(): void {
    if (this.failSchema)
      throw new Error('Injected Shelf schema failure')
    super.migrate()
  }
}

describe('shelf storage lifecycle', () => {
  it('drains accepted reads and rejects every operation admitted after close', async () => {
    const database = new BlockingShelfDatabase()
    const storage = await SqliteShelfStorage.open({ database, databaseOwnership: 'borrowed' })
    const read = storage.sources.list()
    await database.readStarted.promise

    const close = storage.close()
    expect(storage.close()).toBe(close)
    let closeSettled = false
    void close.then(() => {
      closeSettled = true
    })
    await Promise.resolve()
    expect(closeSettled).toBe(false)

    await expect(storage.sources.get('source-1')).rejects.toThrow('Shelf storage is closed')
    await expect(storage.sources.acknowledgeOperations([])).rejects.toThrow('Shelf storage is closed')
    await expect(storage.sources.mergeOperations([])).rejects.toThrow('Shelf storage is closed')
    await expect(storage.pages.get('source-1', 'https://example.test/catalog'))
      .rejects
      .toThrow('Shelf storage is closed')

    database.releaseRead.resolve()
    await expect(read).resolves.toEqual([])
    await expect(close).resolves.toBeUndefined()
  })

  it('keeps a borrowed database open when storage closes', async () => {
    const database = new BlockingShelfDatabase()
    const storage = await SqliteShelfStorage.open({ database, databaseOwnership: 'borrowed' })

    await storage.close()

    expect(database.closeSpy).not.toHaveBeenCalled()
  })

  it('closes an owned database after the operation supervisor drains', async () => {
    const database = new BlockingShelfDatabase()
    const storage = await SqliteShelfStorage.open({ database, databaseOwnership: 'owned' })
    const read = storage.sources.list()
    await database.readStarted.promise

    const close = storage.close()
    expect(database.closeSpy).not.toHaveBeenCalled()
    database.releaseRead.resolve()

    await read
    await close
    expect(database.closeSpy).toHaveBeenCalledOnce()
  })

  it('rolls back an owned database when schema acquisition fails', async () => {
    const database = new BlockingShelfDatabase()
    database.failSchema = true

    await expect(SqliteShelfStorage.open({ database, databaseOwnership: 'owned' }))
      .rejects
      .toThrow('Injected Shelf schema failure')
    expect(database.closeSpy).toHaveBeenCalledOnce()
  })

  it('retains an owned database for a later close retry after a close failure', async () => {
    const database = new BlockingShelfDatabase()
    const failure = new Error('Shelf database is busy')
    database.closeSpy.mockRejectedValueOnce(failure)
    const storage = await SqliteShelfStorage.open({ database, databaseOwnership: 'owned' })

    await expect(storage.close()).rejects.toMatchObject({
      cause: failure,
      message: 'Failed to close Shelf database',
    })
    await expect(storage.close()).resolves.toBeUndefined()
    expect(database.closeSpy).toHaveBeenCalledTimes(2)
  })
})
