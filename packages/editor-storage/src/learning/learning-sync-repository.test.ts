import { afterEach, describe, expect, it } from 'vitest'
import { SqliteTestDatabase } from '../sqlite-test-database'
import { LearningSyncRepository } from './learning-sync-repository'

let database: SqliteTestDatabase | undefined

async function createRepository() {
  database = new SqliteTestDatabase()
  database.migrate()
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

  it('acknowledges P2P mutations without advancing the legacy server watermark', async () => {
    const repository = await createRepository()
    await database?.run(
      'INSERT INTO learning_sync_outbox (mutation_id, entity_kind, entity_id, operation, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['p2p-mutation', 'assignment', 'note', 'upsert', '{}', 10],
    )

    await repository.acknowledgeMutations(['p2p-mutation'])

    await expect(database?.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_sync_outbox',
    )).resolves.toEqual({ count: 0 })
    await expect(database?.get<{ last_server_sequence: number }>(
      'SELECT last_server_sequence FROM learning_sync_state WHERE singleton = 1',
    )).resolves.toEqual({ last_server_sequence: 0 })
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

  it('applies a remote assignment once and records its device sequence', async () => {
    const repository = await createRepository()
    await database?.run(
      'INSERT INTO learning_optimizers (optimizer_id, name, is_global, status, current_revision_id, created_at, updated_at) VALUES (?, ?, 0, \'active\', ?, ?, ?)',
      ['optimizer', 'Remote', 'revision', 1, 1],
    )
    await database?.run(
      'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, ?, ?)',
      ['revision', 'optimizer', '{}', 'remote', 1],
    )
    await database?.run(
      'INSERT INTO notes (id, title, kind, checkpoint_sequence, latest_sequence, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)',
      ['note', 'Note', 'regular', 1, 1],
    )
    const input = {
      createdAt: 10,
      entityId: 'note',
      entityKind: 'assignment' as const,
      mutationId: 'remote-mutation',
      operation: 'upsert' as const,
      payload: { noteId: 'note', optimizerId: 'optimizer' },
      sourceDeviceId: 'peer-device',
      sourceSequence: 4,
    }
    await repository.applyRemote(input)
    await repository.applyRemote(input)
    await expect(database?.get<{ optimizer_id: string }>(
      'SELECT optimizer_id FROM learning_note_optimizer_assignments WHERE note_id = ?',
      ['note'],
    )).resolves.toEqual({ optimizer_id: 'optimizer' })
    await expect(database?.get<{ count: number }>(
      'SELECT COUNT(*) AS count FROM learning_sync_received_mutations WHERE mutation_id = ?',
      ['remote-mutation'],
    )).resolves.toEqual({ count: 1 })
  })

  it('applies remote card tombstones and rejects later resurrection', async () => {
    const repository = await createRepository()
    await database?.run(
      'INSERT INTO learning_cards (card_id, note_id, topic_id, topic_order, source_block_id, source_order, kind, direction, active, first_seen_at, last_seen_at, inactive_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)',
      ['card', 'note', 'topic', 0, 'block', 0, 'basic', 'forward', 1, 1],
    )
    await database?.run(
      'INSERT INTO learning_targets (target_id, card_id, target_kind, item_block_id, target_order, active, created_at, inactive_at) VALUES (?, ?, ?, NULL, ?, 1, ?, NULL)',
      ['target', 'card', 'whole', 0, 1],
    )

    await repository.applyRemote({
      createdAt: 10,
      entityId: 'tombstone',
      entityKind: 'tombstone',
      mutationId: 'remote-tombstone',
      operation: 'delete',
      payload: { generation: 2, scopeId: 'card', scopeKind: 'card', tombstoneId: 'tombstone' },
      sourceDeviceId: 'peer-device',
      sourceSequence: 3,
    })
    await repository.applyRemote({
      createdAt: 11,
      entityId: 'card',
      entityKind: 'card',
      mutationId: 'remote-card-resurrection',
      operation: 'upsert',
      payload: {
        cardId: 'card',
        direction: 'forward',
        itemBlockIds: [],
        kind: 'basic',
        noteId: 'note',
        sourceBlockId: 'block',
        sourceOrder: 0,
        topicId: 'topic',
        topicOrder: 0,
      },
      sourceDeviceId: 'peer-device',
      sourceSequence: 4,
    })

    await expect(
      database?.get<{ count: number }>('SELECT COUNT(*) AS count FROM learning_cards WHERE card_id = ?', ['card']),
    ).resolves.toEqual({ count: 0 })
    await expect(
      database?.get<{ count: number }>('SELECT COUNT(*) AS count FROM learning_targets WHERE card_id = ?', ['card']),
    ).resolves.toEqual({ count: 0 })
    await expect(
      database?.get<{ count: number }>('SELECT COUNT(*) AS count FROM learning_purge_tombstones WHERE scope_kind = ? AND scope_id = ?', ['card', 'card']),
    ).resolves.toEqual({ count: 1 })
  })
})
