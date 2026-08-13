import type {
  ShelfSource,
  ShelfSourceFieldClocks,
  ShelfSourceOperation,
  StoredShelfSource,
} from '@memorilo/shelf'
import type { DatabaseCommand, EditorStorageDatabase } from './database-driver'
import { v7 as createUuidV7 } from 'uuid'
import {
  clockLogical,
  clockPhysical,
  mergeShelfSourceOperation,
  sourceFields,
} from './shelf-source-sync'

interface ShelfSyncStateRow {
  actor_id: string
  last_logical: number
  last_physical: number
}

interface ShelfSourceRow {
  added_at: number
  auth: ShelfSource['auth']
  deleted: number
  enabled: number
  encrypted_password: Uint8Array | null
  field_clocks_json: string
  id: string
  kind: ShelfSource['kind']
  name: string
  order_key: string
  updated_at: number
  url: string
  username: string | null
}

interface ShelfOperationRow {
  actor_id: string
  clock: string
  fields_json: string
  id: string
  source_id: string
}

export interface StoredShelfSourceRecord {
  deleted: boolean
  source: StoredShelfSource
}

export interface PreparedShelfSourceOperation {
  clock: string
  operationCommand: DatabaseCommand
  syncStateCommand: DatabaseCommand
}

interface NextClock {
  actorId: string
  clock: string
  state: ShelfSyncStateRow
}

function parseFieldClocks(value: string): ShelfSourceFieldClocks {
  const parsed: unknown = JSON.parse(value)
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object')
    throw new TypeError('Stored Shelf source field clocks must be an object')
  const record = parsed as Record<string, unknown>
  for (const field of sourceFields) {
    if (typeof record[field] !== 'string' || record[field].length === 0)
      throw new TypeError(`Stored Shelf source is missing the ${field} clock`)
  }
  return record as unknown as ShelfSourceFieldClocks
}

function toStoredSource(row: ShelfSourceRow): StoredShelfSource {
  if (row.deleted !== 0 && row.deleted !== 1)
    throw new TypeError(`Stored Shelf source ${row.id} has invalid deletion state`)
  return {
    addedAt: row.added_at,
    auth: row.auth,
    enabled: row.enabled === 1,
    encryptedPassword: row.encrypted_password === null ? null : new Uint8Array(row.encrypted_password),
    fieldClocks: parseFieldClocks(row.field_clocks_json),
    id: row.id,
    kind: row.kind,
    name: row.name,
    orderKey: row.order_key,
    updatedAt: row.updated_at,
    url: row.url,
    username: row.username,
  }
}
function formatClock(physical: number, logical: number, actorId: string): string {
  return `${physical.toString().padStart(13, '0')}:${logical.toString().padStart(8, '0')}:${actorId}`
}

function advanceClock(state: ShelfSyncStateRow, observed?: string): NextClock {
  const now = Date.now()
  const observedPhysical = observed ? clockPhysical(observed) : 0
  const observedLogical = observed ? clockLogical(observed) : 0
  const physical = Math.max(now, state.last_physical, observedPhysical)
  let logical = 0
  if (physical === state.last_physical && physical === observedPhysical)
    logical = Math.max(state.last_logical, observedLogical) + 1
  else if (physical === state.last_physical)
    logical = state.last_logical + 1
  else if (physical === observedPhysical)
    logical = observedLogical + 1
  return {
    actorId: state.actor_id,
    clock: formatClock(physical, logical, state.actor_id),
    state: { ...state, last_logical: logical, last_physical: physical },
  }
}

function operationFromRow(row: ShelfOperationRow): ShelfSourceOperation {
  const fields: unknown = JSON.parse(row.fields_json)
  if (fields === null || Array.isArray(fields) || typeof fields !== 'object')
    throw new TypeError(`Stored Shelf operation ${row.id} fields must be an object`)
  return {
    actorId: row.actor_id,
    clock: row.clock,
    fields: fields as ShelfSourceOperation['fields'],
    id: row.id,
    sourceId: row.source_id,
  }
}

function syncStateCommand(state: ShelfSyncStateRow): DatabaseCommand {
  return {
    parameters: [state.last_physical, state.last_logical],
    sql: 'UPDATE shelf_sync_state SET last_physical = ?, last_logical = ? WHERE singleton = 1',
  }
}

function operationCommand(operation: ShelfSourceOperation, pending: boolean): DatabaseCommand {
  return {
    parameters: [
      operation.id,
      operation.actorId,
      operation.sourceId,
      operation.clock,
      JSON.stringify(operation.fields),
      pending ? 1 : 0,
      clockPhysical(operation.clock),
    ],
    sql: `
      INSERT INTO shelf_source_operations (id, actor_id, source_id, clock, fields_json, pending, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  }
}

export class ShelfSourcePersistence {
  constructor(private readonly database: EditorStorageDatabase) {}

  async #syncState(): Promise<ShelfSyncStateRow> {
    const state = await this.database.get<ShelfSyncStateRow>(`
      SELECT actor_id, last_physical, last_logical
      FROM shelf_sync_state
      WHERE singleton = 1
    `)
    if (!state)
      throw new Error('Shelf sync state is missing')
    return state
  }

  async read(sourceId: string): Promise<StoredShelfSourceRecord | null> {
    const row = await this.database.get<ShelfSourceRow>(`
      SELECT
        id, kind, url, name, username, auth, enabled, order_key,
        encrypted_password, deleted, field_clocks_json, added_at, updated_at
      FROM shelf_sources
      WHERE id = ?
    `, [sourceId])
    return row ? { deleted: row.deleted === 1, source: toStoredSource(row) } : null
  }

  async listActive(): Promise<readonly StoredShelfSource[]> {
    const rows = await this.database.all<ShelfSourceRow>(`
      SELECT
        id, kind, url, name, username, auth, enabled, order_key,
        encrypted_password, deleted, field_clocks_json, added_at, updated_at
      FROM shelf_sources
      WHERE deleted = 0
      ORDER BY enabled DESC, order_key ASC, id ASC
    `)
    return rows.map(toStoredSource)
  }

  async prepareLocalOperation(
    sourceId: string,
    fields: ShelfSourceOperation['fields'],
  ): Promise<PreparedShelfSourceOperation> {
    const next = advanceClock(await this.#syncState())
    const operation: ShelfSourceOperation = {
      actorId: next.actorId,
      clock: next.clock,
      fields,
      id: createUuidV7(),
      sourceId,
    }
    return {
      clock: next.clock,
      operationCommand: operationCommand(operation, true),
      syncStateCommand: syncStateCommand(next.state),
    }
  }

  async acknowledge(operationIds: readonly string[]): Promise<void> {
    if (operationIds.length === 0)
      return
    await this.database.batch(operationIds.map(operationId => ({
      parameters: [operationId],
      sql: 'UPDATE shelf_source_operations SET pending = 0 WHERE id = ?',
    })))
  }

  async listPending(limit: number): Promise<readonly ShelfSourceOperation[]> {
    const rows = await this.database.all<ShelfOperationRow>(`
      SELECT id, actor_id, source_id, clock, fields_json
      FROM shelf_source_operations
      WHERE pending = 1
      ORDER BY clock ASC, id ASC
      LIMIT ?
    `, [limit])
    return rows.map(operationFromRow)
  }

  async merge(operations: readonly ShelfSourceOperation[]): Promise<void> {
    if (operations.length === 0)
      return

    let syncState = await this.#syncState()
    const commands: DatabaseCommand[] = []
    const receivedOperationIds = new Set<string>()
    const snapshots = new Map<string, StoredShelfSourceRecord | null>()
    const ordered = [...operations].sort((left, right) => {
      const clockOrder = left.clock.localeCompare(right.clock)
      return clockOrder === 0 ? left.id.localeCompare(right.id) : clockOrder
    })

    for (const operation of ordered) {
      if (receivedOperationIds.has(operation.id))
        continue
      const received = await this.database.get<{ id: string }>(
        'SELECT id FROM shelf_source_operations WHERE id = ?',
        [operation.id],
      )
      receivedOperationIds.add(operation.id)
      if (received)
        continue

      if (!snapshots.has(operation.sourceId))
        snapshots.set(operation.sourceId, await this.read(operation.sourceId))
      const current = snapshots.get(operation.sourceId) ?? null
      const merged = mergeShelfSourceOperation(
        current
          ? {
              deleted: current.deleted,
              fieldClocks: current.source.fieldClocks,
              source: current.source,
            }
          : null,
        operation,
      )
      const next = advanceClock(syncState, operation.clock)
      syncState = next.state
      const stored: StoredShelfSource = {
        ...merged.source,
        encryptedPassword: current?.source.encryptedPassword ?? null,
        fieldClocks: merged.fieldClocks,
      }
      snapshots.set(operation.sourceId, { deleted: merged.deleted, source: stored })

      commands.push(
        {
          parameters: [
            stored.id,
            stored.kind,
            stored.url,
            stored.name,
            stored.username,
            stored.auth,
            stored.enabled ? 1 : 0,
            stored.orderKey,
            merged.deleted ? 1 : 0,
            JSON.stringify(stored.fieldClocks),
            stored.addedAt,
            Math.max(stored.updatedAt, clockPhysical(operation.clock)),
          ],
          sql: `
            INSERT INTO shelf_sources (
              id, kind, url, name, username, auth, enabled, order_key,
              encrypted_password, deleted, field_clocks_json, added_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              kind = excluded.kind,
              url = excluded.url,
              name = excluded.name,
              username = excluded.username,
              auth = excluded.auth,
              enabled = excluded.enabled,
              order_key = excluded.order_key,
              deleted = excluded.deleted,
              field_clocks_json = excluded.field_clocks_json,
              updated_at = excluded.updated_at
          `,
        },
        operationCommand(operation, false),
      )
      if (merged.deleted)
        commands.push({ parameters: [operation.sourceId], sql: 'DELETE FROM shelf_pages WHERE source_id = ?' })
    }

    if (commands.length > 0)
      await this.database.batch([syncStateCommand(syncState), ...commands])
  }
}
