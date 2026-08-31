import type {
  ShelfSource,
  ShelfSourceFieldClocks,
  ShelfSourceOperation,
  StoredShelfSource,
} from '@memorilo/shelf'
import type { DatabaseCommand, EditorStorageDatabase, EditorStorageDrizzleDatabase } from './database-driver'
import { asc, desc, eq } from 'drizzle-orm'
import { v7 as createUuidV7 } from 'uuid'
import { shelfPages, shelfSourceOperations, shelfSources, shelfSyncState } from './drizzle-schema'
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
    drizzle: database => database.update(shelfSyncState).set({
      lastLogical: state.last_logical,
      lastPhysical: state.last_physical,
    }).where(eq(shelfSyncState.singleton, 1)).run(),
  }
}

function operationCommand(operation: ShelfSourceOperation, pending: boolean): DatabaseCommand {
  return {
    drizzle: database => database.insert(shelfSourceOperations).values({
      actorId: operation.actorId,
      clock: operation.clock,
      createdAt: clockPhysical(operation.clock),
      fieldsJson: JSON.stringify(operation.fields),
      id: operation.id,
      pending: pending ? 1 : 0,
      sourceId: operation.sourceId,
    }).run(),
  }
}

export class ShelfSourcePersistence {
  readonly #orm: EditorStorageDrizzleDatabase

  constructor(private readonly database: EditorStorageDatabase) {
    this.#orm = database.drizzle
  }

  async #syncState(): Promise<ShelfSyncStateRow> {
    const state = this.#orm.select({
      actor_id: shelfSyncState.actorId,
      last_logical: shelfSyncState.lastLogical,
      last_physical: shelfSyncState.lastPhysical,
    }).from(shelfSyncState).where(eq(shelfSyncState.singleton, 1)).get() as ShelfSyncStateRow | undefined
    if (!state)
      throw new Error('Shelf sync state is missing')
    return state
  }

  async read(sourceId: string): Promise<StoredShelfSourceRecord | null> {
    const row = this.#orm.select({
      id: shelfSources.id,
      kind: shelfSources.kind,
      url: shelfSources.url,
      name: shelfSources.name,
      username: shelfSources.username,
      auth: shelfSources.auth,
      enabled: shelfSources.enabled,
      order_key: shelfSources.orderKey,
      encrypted_password: shelfSources.encryptedPassword,
      deleted: shelfSources.deleted,
      field_clocks_json: shelfSources.fieldClocksJson,
      added_at: shelfSources.addedAt,
      updated_at: shelfSources.updatedAt,
    }).from(shelfSources).where(eq(shelfSources.id, sourceId)).get() as ShelfSourceRow | undefined
    return row ? { deleted: row.deleted === 1, source: toStoredSource(row) } : null
  }

  async listActive(): Promise<readonly StoredShelfSource[]> {
    await this.database.beforeDrizzleRead?.('shelfSources.listActive')
    const rows = this.#orm.select({
      id: shelfSources.id,
      kind: shelfSources.kind,
      url: shelfSources.url,
      name: shelfSources.name,
      username: shelfSources.username,
      auth: shelfSources.auth,
      enabled: shelfSources.enabled,
      order_key: shelfSources.orderKey,
      encrypted_password: shelfSources.encryptedPassword,
      deleted: shelfSources.deleted,
      field_clocks_json: shelfSources.fieldClocksJson,
      added_at: shelfSources.addedAt,
      updated_at: shelfSources.updatedAt,
    }).from(shelfSources).where(eq(shelfSources.deleted, 0)).orderBy(desc(shelfSources.enabled), asc(shelfSources.orderKey), asc(shelfSources.id)).all() as ShelfSourceRow[]
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
    this.#orm.transaction((transaction) => {
      for (const operationId of operationIds)
        transaction.update(shelfSourceOperations).set({ pending: 0 }).where(eq(shelfSourceOperations.id, operationId)).run()
    })
  }

  async listPending(limit: number): Promise<readonly ShelfSourceOperation[]> {
    const rows = this.#orm.select({
      id: shelfSourceOperations.id,
      actor_id: shelfSourceOperations.actorId,
      source_id: shelfSourceOperations.sourceId,
      clock: shelfSourceOperations.clock,
      fields_json: shelfSourceOperations.fieldsJson,
    }).from(shelfSourceOperations).where(eq(shelfSourceOperations.pending, 1)).orderBy(asc(shelfSourceOperations.clock), asc(shelfSourceOperations.id)).limit(limit).all() as ShelfOperationRow[]
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
      const received = this.#orm.select({ id: shelfSourceOperations.id })
        .from(shelfSourceOperations)
        .where(eq(shelfSourceOperations.id, operation.id))
        .get()
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
          drizzle: database => database.insert(shelfSources).values({
            addedAt: stored.addedAt,
            auth: stored.auth,
            deleted: merged.deleted ? 1 : 0,
            enabled: stored.enabled ? 1 : 0,
            encryptedPassword: null,
            fieldClocksJson: JSON.stringify(stored.fieldClocks),
            id: stored.id,
            kind: stored.kind,
            name: stored.name,
            orderKey: stored.orderKey,
            updatedAt: Math.max(stored.updatedAt, clockPhysical(operation.clock)),
            url: stored.url,
            username: stored.username,
          }).onConflictDoUpdate({
            set: {
              auth: stored.auth,
              deleted: merged.deleted ? 1 : 0,
              enabled: stored.enabled ? 1 : 0,
              fieldClocksJson: JSON.stringify(stored.fieldClocks),
              kind: stored.kind,
              name: stored.name,
              orderKey: stored.orderKey,
              updatedAt: Math.max(stored.updatedAt, clockPhysical(operation.clock)),
              url: stored.url,
              username: stored.username,
            },
            target: shelfSources.id,
          }).run(),
        },
        operationCommand(operation, false),
      )
      if (merged.deleted) {
        commands.push({
          drizzle: database => database.delete(shelfPages)
            .where(eq(shelfPages.sourceId, operation.sourceId))
            .run(),
        })
      }
    }

    if (commands.length > 0)
      await this.database.batch([syncStateCommand(syncState), ...commands])
  }
}
