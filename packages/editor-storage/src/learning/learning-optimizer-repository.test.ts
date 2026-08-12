import { defaultOptimizerConfiguration, FSRSVersion } from '@memorilo/srs'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteTestDatabase } from '../sqlite-test-database'
import { LearningOptimizerCatalog } from './learning-optimizer-catalog'
import { LearningOptimizerRepository } from './learning-optimizer-repository'
import { LearningReviewHistory } from './learning-review-history'
import { GLOBAL_OPTIMIZER_ID, GLOBAL_OPTIMIZER_REVISION_ID, learningSchema } from './schema'

const databases: SqliteTestDatabase[] = []

async function createRepository() {
  const database = new SqliteTestDatabase()
  databases.push(database)
  await database.exec(learningSchema)
  const configuration = defaultOptimizerConfiguration()
  const now = 1
  await database.batch([
    {
      parameters: [GLOBAL_OPTIMIZER_ID, 'Global', GLOBAL_OPTIMIZER_REVISION_ID, now, now],
      sql: 'INSERT INTO learning_optimizers (optimizer_id, name, is_global, status, current_revision_id, created_at, updated_at) VALUES (?, ?, 1, \'active\', ?, ?, ?)',
    },
    {
      parameters: [GLOBAL_OPTIMIZER_REVISION_ID, GLOBAL_OPTIMIZER_ID, JSON.stringify(configuration), FSRSVersion, now],
      sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, ?, ?)',
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
    await database.exec(learningSchema)
    const configuration = defaultOptimizerConfiguration()
    const now = 1
    await database.batch([
      {
        parameters: [GLOBAL_OPTIMIZER_ID, 'Global', GLOBAL_OPTIMIZER_REVISION_ID, now, now],
        sql: 'INSERT INTO learning_optimizers (optimizer_id, name, is_global, status, current_revision_id, created_at, updated_at) VALUES (?, ?, 1, \'active\', ?, ?, ?)',
      },
      {
        parameters: [GLOBAL_OPTIMIZER_REVISION_ID, GLOBAL_OPTIMIZER_ID, JSON.stringify(configuration), FSRSVersion, now],
        sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, ?, ?)',
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
})
