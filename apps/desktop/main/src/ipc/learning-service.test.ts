import type { DesktopAnkiService } from '../anki/desktop-anki-service'
import type { LearningReviewApplication } from '../learning/learning-review-application'
import { SqliteEditorStorage } from '@memorilo/editor-storage'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BetterSqliteDatabase } from '../storage/better-sqlite-database'
import { createLearningHandlers } from './learning-service'

const embeddingModel = {
  dimensions: 3,
  id: 'test/learning-service-sync',
  embedDocuments: async (texts: readonly string[]) => texts.map(() => Float32Array.from([1, 0, 0])),
  embedQuery: async () => Float32Array.from([1, 0, 0]),
}

describe('learning service synchronization', () => {
  const storages: Array<Awaited<ReturnType<typeof SqliteEditorStorage.open>>> = []
  const databases: BetterSqliteDatabase[] = []

  afterEach(async () => {
    await Promise.all(storages.splice(0).map(storage => storage.close()))
    await Promise.all(databases.splice(0).map(database => database.close()))
  })

  it('notifies P2P synchronization after a local learning mutation is persisted', async () => {
    const database = new BetterSqliteDatabase(':memory:')
    databases.push(database)
    const storage = await SqliteEditorStorage.open({
      database,
      databaseOwnership: 'owned',
      embeddingModel,
    })
    storages.push(storage)
    const notifyChangesAvailable = vi.fn()
    const handlers = createLearningHandlers(
      storage.learning,
      {} as LearningReviewApplication,
      {} as DesktopAnkiService,
      Date.now,
      notifyChangesAvailable,
    )

    const optimizer = await handlers.createOptimizer({ name: 'Synced optimizer' })

    expect(optimizer.name).toBe('Synced optimizer')
    expect(notifyChangesAvailable).toHaveBeenCalledOnce()
  })
})
