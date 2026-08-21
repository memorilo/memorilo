import type { EditorStorageDatabase, StorageOperationRunner } from '../database-driver'
import type {
  AcknowledgeLearningSyncInput,
  ApplyLearningSyncChangeInput,
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

  applyRemote(input: ApplyLearningSyncChangeInput): Promise<void> {
    if (!input.mutationId || !input.sourceDeviceId)
      throw new TypeError('Remote learning mutation identity is required')
    if (!Number.isSafeInteger(input.sourceSequence) || input.sourceSequence < 1)
      throw new RangeError('Remote learning mutation sequence must be positive')
    return this.#runOperation(async () => {
      const received = await this.#database.get<{ mutation_id: string }>(
        'SELECT mutation_id FROM learning_sync_received_mutations WHERE mutation_id = ?',
        [input.mutationId],
      )
      if (received)
        return
      const payload = input.payload && typeof input.payload === 'object'
        ? input.payload as Record<string, unknown>
        : {}
      const now = Number.isSafeInteger(input.createdAt) && input.createdAt >= 0 ? input.createdAt : Date.now()
      const commands = []
      if (input.entityKind === 'tombstone' && input.operation === 'delete') {
        const tombstone = parseTombstone(payload, input.entityId)
        const existingTombstone = await this.#database.get<{ generation: number }>(
          'SELECT generation FROM learning_purge_tombstones WHERE scope_kind = ? AND scope_id = ?',
          [tombstone.scopeKind, tombstone.scopeId],
        )
        if (!existingTombstone || existingTombstone.generation < tombstone.generation) {
          commands.push({
            parameters: [tombstone.scopeKind, tombstone.scopeId],
            sql: 'DELETE FROM learning_purge_tombstones WHERE scope_kind = ? AND scope_id = ?',
          }, {
            parameters: [tombstone.tombstoneId, tombstone.scopeKind, tombstone.scopeId, tombstone.generation, now],
            sql: 'INSERT INTO learning_purge_tombstones (tombstone_id, scope_kind, scope_id, generation, created_at) VALUES (?, ?, ?, ?, ?)',
          })
          if (tombstone.scopeKind === 'target') {
            commands.push({
              parameters: [tombstone.scopeId],
              sql: 'DELETE FROM learning_targets WHERE target_id = ?',
            })
          }
          else if (tombstone.scopeKind === 'card') {
            commands.push({
              parameters: [tombstone.scopeId],
              sql: 'DELETE FROM learning_cards WHERE card_id = ?',
            })
          }
          else {
            commands.push(
              {
                parameters: [tombstone.scopeId],
                sql: 'DELETE FROM learning_note_optimizer_assignments WHERE optimizer_id = ?',
              },
              {
                parameters: [tombstone.scopeId],
                sql: 'DELETE FROM learning_states WHERE optimizer_revision_id IN (SELECT revision_id FROM learning_optimizer_revisions WHERE optimizer_id = ?)',
              },
              {
                parameters: [tombstone.scopeId],
                sql: 'DELETE FROM learning_optimizer_revisions WHERE optimizer_id = ?',
              },
              {
                parameters: [tombstone.scopeId],
                sql: 'DELETE FROM learning_optimizers WHERE optimizer_id = ?',
              },
            )
          }
        }
      }
      else if (input.operation === 'upsert') {
        const tombstoneScope = tombstoneScopeFor(input, payload)
        if (tombstoneScope !== null) {
          const tombstone = await this.#database.get<{ generation: number }>(
            'SELECT generation FROM learning_purge_tombstones WHERE scope_kind = ? AND scope_id = ?',
            [tombstoneScope.scopeKind, tombstoneScope.scopeId],
          )
          const incomingGeneration = Number.isSafeInteger(payload.generation) && (payload.generation as number) > 0
            ? payload.generation as number
            : 0
          if (tombstone && tombstone.generation >= incomingGeneration)
            return this.#recordReceived(input, now)
        }
        switch (input.entityKind) {
          case 'assignment': {
            const noteId = stringPayload(payload, 'noteId', input.entityId)
            const optimizerId = stringPayload(payload, 'optimizerId')
            commands.push({
              parameters: [noteId, optimizerId, now],
              sql: 'INSERT INTO learning_note_optimizer_assignments (note_id, optimizer_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET optimizer_id = excluded.optimizer_id, updated_at = excluded.updated_at',
            })
            break
          }
          case 'optimizer': {
            const optimizerId = stringPayload(payload, 'id', input.entityId)
            const name = stringPayload(payload, 'name', optimizerId)
            const status = payload.status === 'archived' ? 'archived' : 'active'
            const revisionId = stringPayload(payload, 'revisionId', `${optimizerId}:remote`)
            const configuration = payload.configuration && typeof payload.configuration === 'object'
              ? JSON.stringify(payload.configuration)
              : '{}'
            commands.push(
              {
                parameters: [optimizerId, name, status, revisionId, now, now],
                sql: 'INSERT INTO learning_optimizers (optimizer_id, name, is_global, status, current_revision_id, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?) ON CONFLICT(optimizer_id) DO UPDATE SET name = excluded.name, status = excluded.status, current_revision_id = excluded.current_revision_id, updated_at = excluded.updated_at',
              },
              {
                parameters: [revisionId, optimizerId, configuration, 'remote', now],
                sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(revision_id) DO NOTHING',
              },
            )
            break
          }
          case 'card': {
            const cardId = stringPayload(payload, 'cardId', input.entityId)
            const noteId = stringPayload(payload, 'noteId')
            const topicId = stringPayload(payload, 'topicId')
            const sourceBlockId = stringPayload(payload, 'sourceBlockId')
            const kind = stringPayload(payload, 'kind', 'basic')
            const direction = stringPayload(payload, 'direction', 'forward')
            const topicOrder = integerPayload(payload, 'topicOrder')
            const sourceOrder = integerPayload(payload, 'sourceOrder')
            const itemBlockIds = Array.isArray(payload.itemBlockIds) ? payload.itemBlockIds : []
            commands.push({
              parameters: [cardId, noteId, topicId, topicOrder, sourceBlockId, sourceOrder, kind, direction, now, now],
              sql: 'INSERT INTO learning_cards (card_id, note_id, topic_id, topic_order, source_block_id, source_order, kind, direction, active, first_seen_at, last_seen_at, inactive_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL) ON CONFLICT(card_id) DO UPDATE SET note_id = excluded.note_id, topic_id = excluded.topic_id, topic_order = excluded.topic_order, source_block_id = excluded.source_block_id, source_order = excluded.source_order, kind = excluded.kind, direction = excluded.direction, active = 1, last_seen_at = excluded.last_seen_at, inactive_at = NULL',
            })
            for (const [targetOrder, itemBlockId] of itemBlockIds.entries()) {
              if (typeof itemBlockId !== 'string')
                continue
              commands.push({
                parameters: [`${cardId}:${itemBlockId}`, cardId, 'item', itemBlockId, targetOrder, now],
                sql: 'INSERT INTO learning_targets (target_id, card_id, target_kind, item_block_id, target_order, active, created_at, inactive_at) VALUES (?, ?, ?, ?, ?, 1, ?, NULL) ON CONFLICT(target_id) DO UPDATE SET active = 1, inactive_at = NULL, target_order = excluded.target_order',
              })
            }
            break
          }
          case 'review-event': {
            const targetId = stringPayload(payload, 'targetId')
            const eventId = stringPayload(payload, 'eventId', input.entityId)
            const kind = stringPayload(payload, 'kind')
            const occurredAt = integerPayload(payload, kind === 'reset' ? 'resetAt' : kind === 'undo' ? 'undoneAt' : 'reviewedAt')
            if (kind !== 'rating' && kind !== 'reset' && kind !== 'undo')
              throw new TypeError('Unsupported remote review event kind')
            const resultState = payload.resultState && typeof payload.resultState === 'object'
              ? payload.resultState as Record<string, unknown>
              : null
            const cardId = stringPayload(payload, 'cardId', targetId)
            const noteId = stringPayload(payload, 'noteId', targetId)
            commands.push({
              parameters: [
                eventId,
                targetId,
                cardId,
                noteId,
                occurredAt,
                kind === 'rating' ? stringPayload(payload, 'rating') : null,
                kind === 'undo' ? stringPayload(payload, 'undoesEventId') : null,
                kind === 'reset' ? String(occurredAt) : null,
                JSON.stringify(resultState),
                input.sourceDeviceId,
                input.sourceSequence,
              ],
              sql: 'INSERT INTO learning_review_events (event_id, target_id, card_id, note_id, event_kind, occurred_at, rating, undoes_event_id, reset_epoch, result_state_json, device_id, device_sequence, fsrs_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING',
            })
            if (resultState !== null) {
              commands.push({
                parameters: [
                  stateValue(resultState, 'phase'),
                  stateValue(resultState, 'dueAt'),
                  stateValue(resultState, 'stability'),
                  stateValue(resultState, 'difficulty'),
                  stateValue(resultState, 'scheduledDays'),
                  stateValue(resultState, 'learningSteps'),
                  stateValue(resultState, 'reps'),
                  stateValue(resultState, 'lapses'),
                  stateValue(resultState, 'lastReviewAt'),
                  stateValue(resultState, 'optimizerRevisionId'),
                  stateValue(resultState, 'winningEventId'),
                  stateValue(resultState, 'stateHash'),
                  targetId,
                ],
                sql: 'UPDATE learning_states SET phase = ?, due_at = ?, stability = ?, difficulty = ?, scheduled_days = ?, learning_steps = ?, reps = ?, lapses = ?, last_review_at = ?, optimizer_revision_id = ?, winning_event_id = ?, state_hash = ? WHERE target_id = ?',
              })
            }
            break
          }
          case 'tombstone':
            break
        }
      }
      commands.push({
        parameters: [input.mutationId, input.sourceDeviceId, input.sourceSequence, now],
        sql: 'INSERT INTO learning_sync_received_mutations (mutation_id, source_device_id, source_sequence, received_at) VALUES (?, ?, ?, ?)',
      })
      await this.#database.batch(commands)
    })
  }

  #recordReceived(input: ApplyLearningSyncChangeInput, receivedAt: number): Promise<void> {
    return this.#database.run(
      'INSERT INTO learning_sync_received_mutations (mutation_id, source_device_id, source_sequence, received_at) VALUES (?, ?, ?, ?)',
      [input.mutationId, input.sourceDeviceId, input.sourceSequence, receivedAt],
    )
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

  acknowledgeMutations(mutationIds: readonly string[]): Promise<void> {
    const uniqueMutationIds = [...new Set(mutationIds)]
    uniqueMutationIds.forEach(mutationId => assertNonEmpty(mutationId, 'Sync mutation id'))
    return this.#runOperation(async () => {
      if (uniqueMutationIds.length === 0)
        return
      const placeholders = uniqueMutationIds.map(() => '?').join(', ')
      const existing = await this.#database.get<CountRow>(
        `SELECT COUNT(*) AS count FROM learning_sync_outbox WHERE mutation_id IN (${placeholders})`,
        uniqueMutationIds,
      )
      if (!existing || existing.count !== uniqueMutationIds.length)
        throw new Error('Cannot acknowledge unknown learning sync mutations')
      await this.#database.run(
        `DELETE FROM learning_sync_outbox WHERE mutation_id IN (${placeholders})`,
        uniqueMutationIds,
      )
    })
  }
}

type TombstoneScopeKind = 'card' | 'optimizer' | 'target'

interface TombstonePayload {
  readonly generation: number
  readonly scopeId: string
  readonly scopeKind: TombstoneScopeKind
  readonly tombstoneId: string
}

function parseTombstone(payload: Record<string, unknown>, fallbackId: string): TombstonePayload {
  const scopeKind = payload.scopeKind
  const scopeId = payload.scopeId
  const generation = payload.generation
  const tombstoneId = payload.tombstoneId
  if ((scopeKind !== 'card' && scopeKind !== 'optimizer' && scopeKind !== 'target')
    || typeof scopeId !== 'string' || scopeId.length === 0
    || !Number.isSafeInteger(generation) || (generation as number) < 1
    || (typeof tombstoneId !== 'string' && (typeof fallbackId !== 'string' || fallbackId.length === 0))) {
    throw new TypeError('Remote learning tombstone payload is invalid')
  }
  return {
    generation: generation as number,
    scopeId,
    scopeKind,
    tombstoneId: typeof tombstoneId === 'string' && tombstoneId.length > 0 ? tombstoneId : fallbackId,
  }
}

function tombstoneScopeFor(
  input: ApplyLearningSyncChangeInput,
  payload: Record<string, unknown>,
): { scopeId: string, scopeKind: TombstoneScopeKind } | null {
  if (input.entityKind === 'card')
    return { scopeId: stringPayload(payload, 'cardId', input.entityId), scopeKind: 'card' }
  if (input.entityKind === 'optimizer')
    return { scopeId: stringPayload(payload, 'id', input.entityId), scopeKind: 'optimizer' }
  if (input.entityKind === 'review-event' && typeof payload.targetId === 'string')
    return { scopeId: payload.targetId, scopeKind: 'target' }
  return null
}

function stringPayload(payload: Record<string, unknown>, key: string, fallback?: string): string {
  const value = payload[key]
  if (typeof value === 'string' && value.length > 0)
    return value
  if (fallback !== undefined && fallback.length > 0)
    return fallback
  throw new TypeError(`Remote learning payload field ${key} is required`)
}

function integerPayload(payload: Record<string, unknown>, key: string): number {
  const value = payload[key]
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`Remote learning payload field ${key} must be a non-negative integer`)
  return value as number
}

function stateValue(payload: Record<string, unknown>, key: string): string | number | null {
  const value = payload[key]
  if (value === null || typeof value === 'string' || typeof value === 'number')
    return value
  throw new TypeError(`Remote learning state field ${key} is invalid`)
}
