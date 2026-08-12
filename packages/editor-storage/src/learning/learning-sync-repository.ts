import type { EditorStorageDatabase, StorageOperationRunner } from '../database-driver'
import type {
  AcknowledgeLearningSyncInput,
  LearningSyncChange,
} from './types'
import { assertNonEmpty } from './learning-storage-shared'

interface LearningSyncRepositoryDependencies {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

interface CountRow {
  count: number
}

export class LearningSyncRepository {
  readonly #database: EditorStorageDatabase
  readonly #runOperation: LearningSyncRepositoryDependencies['runOperation']

  constructor(dependencies: LearningSyncRepositoryDependencies) {
    this.#database = dependencies.database
    this.#runOperation = dependencies.runOperation
  }

  listPending(limit = 250): Promise<readonly LearningSyncChange[]> {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new RangeError('Learning sync change limit must be a positive safe integer')
    return this.#runOperation(async () => {
      const rows = await this.#database.all<{
        created_at: number
        entity_id: string
        entity_kind: LearningSyncChange['entityKind']
        mutation_id: string
        operation: LearningSyncChange['operation']
        payload_json: string
      }>(
        'SELECT mutation_id, entity_kind, entity_id, operation, payload_json, created_at FROM learning_sync_outbox ORDER BY created_at, mutation_id LIMIT ?',
        [limit],
      )
      return rows.map(row => ({
        createdAt: row.created_at,
        entityId: row.entity_id,
        entityKind: row.entity_kind,
        mutationId: row.mutation_id,
        operation: row.operation,
        payload: JSON.parse(row.payload_json) as unknown,
      }))
    })
  }

  acknowledge(input: AcknowledgeLearningSyncInput): Promise<void> {
    if (!Number.isSafeInteger(input.serverSequence) || input.serverSequence < 0)
      throw new RangeError('Server sequence must be a non-negative safe integer')
    const mutationIds = [...new Set(input.mutationIds)]
    mutationIds.forEach(mutationId => assertNonEmpty(mutationId, 'Sync mutation id'))
    return this.#runOperation(async () => {
      const commands = []
      if (mutationIds.length > 0) {
        const placeholders = mutationIds.map(() => '?').join(', ')
        const existing = await this.#database.get<CountRow>(
          `SELECT COUNT(*) AS count FROM learning_sync_outbox WHERE mutation_id IN (${placeholders})`,
          mutationIds,
        )
        if (!existing || existing.count !== mutationIds.length)
          throw new Error('Cannot acknowledge unknown learning sync mutations')
        commands.push({
          parameters: mutationIds,
          sql: `DELETE FROM learning_sync_outbox WHERE mutation_id IN (${placeholders})`,
        })
      }
      commands.push({
        parameters: [input.serverSequence],
        sql: 'UPDATE learning_sync_state SET last_server_sequence = MAX(last_server_sequence, ?) WHERE singleton = 1',
      })
      await this.#database.batch(commands)
    })
  }
}
