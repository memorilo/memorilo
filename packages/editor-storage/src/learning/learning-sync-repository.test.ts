import { afterEach, describe, expect, it } from 'vitest'
import { SqliteTestDatabase } from '../sqlite-test-database'
import { LearningSyncRepository } from './learning-sync-repository'
import { learningSchema } from './schema'

let database: SqliteTestDatabase | undefined

async function createRepository() {
  database = new SqliteTestDatabase()
  await database.exec(learningSchema)
  await database.run(
    'INSERT INTO learning_sync_state (singleton, device_id, next_device_sequence, last_server_sequence, schema_generation) VALUES (1, ?, 1, 0, 1)',
    ['device'],
  )
  return new LearningSyncRepository({
    database,
    runOperation: operation => operation(),
  })
}

afterEach(async () => {
  await database?.close()
  database = undefined
})

describe('learning sync repository', () => {
  it('lists and parses persisted outbox changes', async () => {
    const repository = await createRepository()
    await database?.run(
      'INSERT INTO learning_sync_outbox (mutation_id, entity_kind, entity_id, operation, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['mutation', 'assignment', 'note', 'upsert', '{"optimizerId":"global"}', 10],
    )

    await expect(repository.listPending(5)).resolves.toEqual([{
      createdAt: 10,
      entityId: 'note',
      entityKind: 'assignment',
      mutationId: 'mutation',
      operation: 'upsert',
      payload: { optimizerId: 'global' },
    }])
  })

  it('acknowledges deduplicated mutations and advances the server watermark atomically', async () => {
    const repository = await createRepository()
    for (const mutationId of ['first', 'second']) {
      await database?.run(
        'INSERT INTO learning_sync_outbox (mutation_id, entity_kind, entity_id, operation, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [mutationId, 'assignment', mutationId, 'upsert', '{}', 10],
      )
    }

    await repository.acknowledge({
      mutationIds: ['first', 'second', 'first'],
      serverSequence: 7,
    })

    await expect(database?.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_sync_outbox',
    )).resolves.toEqual({ count: 0 })
    await expect(database?.get<{ last_server_sequence: number }>(
      'SELECT last_server_sequence FROM learning_sync_state WHERE singleton = 1',
    )).resolves.toEqual({ last_server_sequence: 7 })
  })

  it('advances an empty acknowledgement watermark without deleting pending changes', async () => {
    const repository = await createRepository()
    await database?.run(
      'INSERT INTO learning_sync_outbox (mutation_id, entity_kind, entity_id, operation, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['pending', 'assignment', 'note', 'upsert', '{}', 10],
    )

    await repository.acknowledge({ mutationIds: [], serverSequence: 9 })

    await expect(database?.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_sync_outbox',
    )).resolves.toEqual({ count: 1 })
    await expect(database?.get<{ last_server_sequence: number }>(
      'SELECT last_server_sequence FROM learning_sync_state WHERE singleton = 1',
    )).resolves.toEqual({ last_server_sequence: 9 })
  })

  it('rejects unknown mutation ids without changing the outbox or watermark', async () => {
    const repository = await createRepository()
    await expect(repository.acknowledge({
      mutationIds: ['unknown'],
      serverSequence: 9,
    })).rejects.toThrow('Cannot acknowledge unknown learning sync mutations')

    await expect(database?.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_sync_outbox',
    )).resolves.toEqual({ count: 0 })
    await expect(database?.get<{ last_server_sequence: number }>(
      'SELECT last_server_sequence FROM learning_sync_state WHERE singleton = 1',
    )).resolves.toEqual({ last_server_sequence: 0 })
  })
})
