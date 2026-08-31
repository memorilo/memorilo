import { createOperationSupervisor } from '@memorilo/effect-lifecycle'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { defaultOptimizerConfiguration, FSRSVersion } from '@memorilo/srs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { learningCards, learningOptimizerRevisions, learningOptimizers, learningTargets } from '../drizzle-schema'
import { SqliteTestDatabase } from '../sqlite-test-database'
import { LearningOptimizerCatalog } from './learning-optimizer-catalog'
import { LearningOptimizerRepository } from './learning-optimizer-repository'
import { LearningReviewHistory } from './learning-review-history'
import { GLOBAL_OPTIMIZER_ID, GLOBAL_OPTIMIZER_REVISION_ID } from './schema'

const databases: SqliteTestDatabase[] = []

async function createRepository() {
  const database = new SqliteTestDatabase()
  databases.push(database)
  database.migrate()
  const configuration = defaultOptimizerConfiguration()
  const now = 1
  await database.batch([
    {
      drizzle: orm => orm.insert(learningOptimizers).values({ optimizerId: GLOBAL_OPTIMIZER_ID, name: 'Global', isGlobal: 1, status: 'active', currentRevisionId: GLOBAL_OPTIMIZER_REVISION_ID, createdAt: now, updatedAt: now }).run(),
    },
    {
      drizzle: orm => orm.insert(learningOptimizerRevisions).values({ revisionId: GLOBAL_OPTIMIZER_REVISION_ID, optimizerId: GLOBAL_OPTIMIZER_ID, configurationJson: JSON.stringify(configuration), fsrsVersion: FSRSVersion, createdAt: now }).run(),
    },
  ])
  const repository = new LearningOptimizerRepository({
    catalog: new LearningOptimizerCatalog(database),
    database,
    history: new LearningReviewHistory(database),
    runOperation: operation => operation(),
  })
  return { database, repository }
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.close()))
})

describe('learning optimizer repository', () => {
  it('persists optimizer creation and revision changes as observable state', async () => {
    const { database, repository } = await createRepository()
    const created = await repository.create({ name: '  Personal  ' })

    expect(created.name).toBe('Personal')
    expect((await repository.list()).map(optimizer => optimizer.id)).toEqual([
      GLOBAL_OPTIMIZER_ID,
      created.id,
    ])
    expect(await database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_optimizer_revisions WHERE optimizer_id = ?',
      [created.id],
    )).toEqual({ count: 1 })

    const saved = await repository.save({
      configuration: { ...created.configuration, desiredRetention: 0.94 },
      name: 'Personal Updated',
      optimizerId: created.id,
    })

    expect(saved).toMatchObject({
      id: created.id,
      name: 'Personal Updated',
      configuration: { desiredRetention: 0.94 },
    })
    expect(saved.revisionId).not.toBe(created.revisionId)
    expect(await database.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_sync_outbox WHERE entity_kind = \'optimizer\' AND entity_id = ?',
      [created.id],
    )).toEqual({ count: 2 })
  })

  it('rolls back a failed save and accepts a retry', async () => {
    const { database, repository } = await createRepository()
    const created = await repository.create({ name: 'Retryable' })
    const input = {
      configuration: { ...created.configuration, desiredRetention: 0.95 },
      name: 'Retryable Updated',
      optimizerId: created.id,
    }

    database.failNextBatch = true
    await expect(repository.save(input)).rejects.toThrow('Injected batch failure')
    await expect(repository.get(created.id)).resolves.toEqual(created)

    await expect(repository.save(input)).resolves.toMatchObject({
      id: created.id,
      name: 'Retryable Updated',
      configuration: { desiredRetention: 0.95 },
    })
  })

  it('routes optimizer mutations through the storage operation supervisor', async () => {
    const operations: Array<() => Promise<unknown>> = []
    const database = new SqliteTestDatabase()
    databases.push(database)
    database.migrate()
    const configuration = defaultOptimizerConfiguration()
    const now = 1
    await database.batch([
      {
        drizzle: orm => orm.insert(learningOptimizers).values({ optimizerId: GLOBAL_OPTIMIZER_ID, name: 'Global', isGlobal: 1, status: 'active', currentRevisionId: GLOBAL_OPTIMIZER_REVISION_ID, createdAt: now, updatedAt: now }).run(),
      },
      {
        drizzle: orm => orm.insert(learningOptimizerRevisions).values({ revisionId: GLOBAL_OPTIMIZER_REVISION_ID, optimizerId: GLOBAL_OPTIMIZER_ID, configurationJson: JSON.stringify(configuration), fsrsVersion: FSRSVersion, createdAt: now }).run(),
      },
    ])
    const repository = new LearningOptimizerRepository({
      catalog: new LearningOptimizerCatalog(database),
      database,
      history: new LearningReviewHistory(database),
      runOperation: (operation) => {
        operations.push(operation)
        return operation()
      },
    })

    await repository.create({ name: 'Shared supervisor' })
    expect(operations).toHaveLength(1)
  })

  it('releases shared database admission while FSRS training is running', async () => {
    const database = new SqliteTestDatabase()
    databases.push(database)
    database.migrate()
    const configuration = defaultOptimizerConfiguration()
    await database.batch([
      {
        drizzle: orm => orm.insert(learningOptimizers).values({ optimizerId: GLOBAL_OPTIMIZER_ID, name: 'Global', isGlobal: 1, status: 'active', currentRevisionId: GLOBAL_OPTIMIZER_REVISION_ID, createdAt: 1, updatedAt: 1 }).run(),
      },
      {
        drizzle: orm => orm.insert(learningOptimizerRevisions).values({ revisionId: GLOBAL_OPTIMIZER_REVISION_ID, optimizerId: GLOBAL_OPTIMIZER_ID, configurationJson: JSON.stringify(configuration), fsrsVersion: FSRSVersion, createdAt: 1 }).run(),
      },
      {
        drizzle: orm => orm.insert(learningCards).values({ cardId: 'card', noteId: 'note', topicId: 'topic', topicOrder: 0, sourceBlockId: 'source', sourceOrder: 0, kind: 'basic', direction: 'forward', active: 1, firstSeenAt: 1, lastSeenAt: 1 }).run(),
      },
      {
        drizzle: orm => orm.insert(learningTargets).values({ targetId: 'target', cardId: 'card', targetKind: 'whole', targetOrder: 0, active: 1, createdAt: 1 }).run(),
      },
    ])
    const trainingStarted = deferred<void>()
    const releaseTraining = deferred<typeof configuration>()
    const supervisor = createOperationSupervisor('Optimizer test')
    const repository = new LearningOptimizerRepository({
      catalog: new LearningOptimizerCatalog(database),
      database,
      history: {
        buildRescheduleCommands: async () => [],
        getRatingHistory: async targetId => ({
          ratings: [{ eventId: 'rating', occurredAt: 1, rating: 'good' }],
          targetId,
        }),
      },
      optimizeFsrsParameters: async () => {
        trainingStarted.resolve()
        return releaseTraining.promise
      },
      runOperation: operation => supervisor.run(() => operation()),
    })

    const optimizing = repository.optimize({ optimizerId: GLOBAL_OPTIMIZER_ID })
    await trainingStarted.promise
    const readCompleted = vi.fn()
    void repository.get(GLOBAL_OPTIMIZER_ID).then(readCompleted)
    await vi.waitFor(() => expect(readCompleted).toHaveBeenCalledOnce())

    releaseTraining.resolve({ ...configuration, desiredRetention: 0.94 })
    await expect(optimizing).resolves.toMatchObject({
      configuration: { desiredRetention: 0.94 },
      id: GLOBAL_OPTIMIZER_ID,
    })
    await supervisor.close()
  })
})
