import type {
  CachedShelfPage,
  SaveShelfSourceInput,
  ShelfPage,
  ShelfSource,
  ShelfSourceField,
  ShelfSourceFieldClocks,
  ShelfSourceOperation,
  ShelfStorage,
  StoredShelfSource,
} from '@memorilo/shelf'
import type { EditorStorageDatabase } from './database-driver'
import { v7 as createUuidV7 } from 'uuid'

export interface CreateShelfStorageOptions {
  database: EditorStorageDatabase
}

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

interface ShelfPageRow {
  etag: string | null
  fetched_at: number
  last_modified: string | null
  page_json: string
  source_id: string
  url: string
}

interface ShelfOperationRow {
  actor_id: string
  clock: string
  fields_json: string
  id: string
  source_id: string
}

const sourceFields = ['auth', 'deleted', 'enabled', 'name', 'orderKey', 'url', 'username'] as const

type MutableShelfSourceFields = {
  -readonly [Field in keyof ShelfSourceOperation['fields']]: ShelfSourceOperation['fields'][Field]
}

const shelfSchema = `
  CREATE TABLE IF NOT EXISTS shelf_sync_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    actor_id TEXT NOT NULL,
    last_physical INTEGER NOT NULL CHECK (last_physical >= 0),
    last_logical INTEGER NOT NULL CHECK (last_logical >= 0)
  );

  CREATE TABLE IF NOT EXISTS shelf_sources (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind = 'opds'),
    url TEXT NOT NULL,
    name TEXT NOT NULL,
    username TEXT,
    auth TEXT NOT NULL CHECK (auth IN ('none', 'basic')),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    order_key TEXT NOT NULL,
    encrypted_password BLOB,
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
    field_clocks_json TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS shelf_sources_order_idx
    ON shelf_sources(deleted, enabled, order_key, id);

  CREATE TABLE IF NOT EXISTS shelf_source_operations (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    clock TEXT NOT NULL,
    fields_json TEXT NOT NULL,
    pending INTEGER NOT NULL CHECK (pending IN (0, 1)),
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS shelf_source_operations_pending_idx
    ON shelf_source_operations(pending, clock, id);

  CREATE TABLE IF NOT EXISTS shelf_pages (
    source_id TEXT NOT NULL REFERENCES shelf_sources(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    page_json TEXT NOT NULL,
    etag TEXT,
    last_modified TEXT,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (source_id, url)
  );

`

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
}

function validateRemoteUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new TypeError('Shelf source URL must use HTTP or HTTPS')
  return url.href
}

function validateSource(source: ShelfSource): void {
  assertNonEmpty(source.id, 'Shelf source id')
  assertNonEmpty(source.name, 'Shelf source name')
  assertNonEmpty(source.orderKey, 'Shelf source order key')
  validateRemoteUrl(source.url)
  if (source.kind !== 'opds')
    throw new TypeError(`Unsupported Shelf source kind: ${String(source.kind)}`)
  if (source.auth === 'basic' && source.username === null)
    throw new TypeError('A Basic-authenticated Shelf source requires a username')
  if (!Number.isSafeInteger(source.addedAt) || source.addedAt < 0)
    throw new RangeError('Shelf source addedAt must be a non-negative integer')
  if (!Number.isSafeInteger(source.updatedAt) || source.updatedAt < source.addedAt)
    throw new RangeError('Shelf source updatedAt must be an integer no earlier than addedAt')
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

function publicSource(source: StoredShelfSource): ShelfSource {
  const { encryptedPassword: _encryptedPassword, fieldClocks: _fieldClocks, ...value } = source
  return value
}

function clockPhysical(clock: string): number {
  const physical = Number(clock.split(':', 1)[0])
  if (!Number.isSafeInteger(physical) || physical < 0)
    throw new TypeError(`Invalid Shelf operation clock: ${clock}`)
  return physical
}

function clockLogical(clock: string): number {
  const parts = clock.split(':')
  const logical = Number(parts[1])
  if (parts.length < 3 || !Number.isSafeInteger(logical) || logical < 0)
    throw new TypeError(`Invalid Shelf operation clock: ${clock}`)
  return logical
}

function formatClock(physical: number, logical: number, actorId: string): string {
  return `${physical.toString().padStart(13, '0')}:${logical.toString().padStart(8, '0')}:${actorId}`
}

function parsePage(value: string): ShelfPage {
  const page: unknown = JSON.parse(value)
  if (page === null || Array.isArray(page) || typeof page !== 'object')
    throw new TypeError('Stored Shelf page must be an object')
  const record = page as Record<string, unknown>
  if (typeof record.title !== 'string' || typeof record.selfUrl !== 'string')
    throw new TypeError('Stored Shelf page is missing its title or URL')
  if (!Array.isArray(record.navigation) || !Array.isArray(record.publications))
    throw new TypeError('Stored Shelf page has invalid content collections')
  return page as ShelfPage
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

function changedFields(current: StoredShelfSource | null, next: ShelfSource): ShelfSourceOperation['fields'] {
  if (current === null) {
    return {
      auth: next.auth,
      deleted: false,
      enabled: next.enabled,
      name: next.name,
      orderKey: next.orderKey,
      url: next.url,
      username: next.username,
    }
  }
  const fields: MutableShelfSourceFields = {}
  if (current.auth !== next.auth)
    fields.auth = next.auth
  if (current.enabled !== next.enabled)
    fields.enabled = next.enabled
  if (current.name !== next.name)
    fields.name = next.name
  if (current.orderKey !== next.orderKey)
    fields.orderKey = next.orderKey
  if (current.url !== next.url)
    fields.url = next.url
  if (current.username !== next.username)
    fields.username = next.username
  return fields
}

function validateOperation(operation: ShelfSourceOperation): void {
  assertNonEmpty(operation.id, 'Shelf operation id')
  assertNonEmpty(operation.actorId, 'Shelf operation actor id')
  assertNonEmpty(operation.sourceId, 'Shelf operation source id')
  clockPhysical(operation.clock)
  clockLogical(operation.clock)
  const keys = Object.keys(operation.fields)
  if (keys.length === 0)
    throw new TypeError(`Shelf operation ${operation.id} must change at least one field`)
  for (const key of keys) {
    if (!sourceFields.includes(key as ShelfSourceField))
      throw new TypeError(`Shelf operation ${operation.id} contains unknown field ${key}`)
  }
}

class DefaultShelfStorage implements ShelfStorage {
  readonly #database: EditorStorageDatabase
  #writeQueue: Promise<void> = Promise.resolve()

  private constructor(database: EditorStorageDatabase) {
    this.#database = database
  }

  static async create(options: CreateShelfStorageOptions): Promise<DefaultShelfStorage> {
    await options.database.exec(shelfSchema)
    await options.database.run(`
      INSERT INTO shelf_sync_state (singleton, actor_id, last_physical, last_logical)
      VALUES (1, ?, 0, 0)
      ON CONFLICT(singleton) DO NOTHING
    `, [createUuidV7()])
    return new DefaultShelfStorage(options.database)
  }

  async #serializeWrite<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#writeQueue.then(operation)
    this.#writeQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async #nextClock(observed?: string): Promise<{ actorId: string, clock: string, state: ShelfSyncStateRow }> {
    const state = await this.#database.get<ShelfSyncStateRow>(`
      SELECT actor_id, last_physical, last_logical
      FROM shelf_sync_state
      WHERE singleton = 1
    `)
    if (!state)
      throw new Error('Shelf sync state is missing')
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

  async #sourceRow(sourceId: string): Promise<ShelfSourceRow | undefined> {
    return this.#database.get<ShelfSourceRow>(`
      SELECT
        id, kind, url, name, username, auth, enabled, order_key,
        encrypted_password, deleted, field_clocks_json, added_at, updated_at
      FROM shelf_sources
      WHERE id = ?
    `, [sourceId])
  }

  async acknowledgeOperations(operationIds: readonly string[]): Promise<void> {
    if (operationIds.length === 0)
      return
    await this.#serializeWrite(async () => {
      const commands = operationIds.map((operationId) => {
        assertNonEmpty(operationId, 'Shelf operation id')
        return {
          parameters: [operationId],
          sql: 'UPDATE shelf_source_operations SET pending = 0 WHERE id = ?',
        }
      })
      await this.#database.batch(commands)
    })
  }

  async deleteSource(sourceId: string): Promise<void> {
    assertNonEmpty(sourceId, 'Shelf source id')
    await this.#serializeWrite(async () => {
      const row = await this.#sourceRow(sourceId)
      if (!row)
        throw new Error(`Unknown Shelf source: ${sourceId}`)
      const source = toStoredSource(row)
      const next = await this.#nextClock()
      const operation: ShelfSourceOperation = {
        actorId: next.actorId,
        clock: next.clock,
        fields: { deleted: true },
        id: createUuidV7(),
        sourceId,
      }
      const clocks = { ...source.fieldClocks, deleted: next.clock }
      await this.#database.batch([
        {
          parameters: [next.state.last_physical, next.state.last_logical],
          sql: 'UPDATE shelf_sync_state SET last_physical = ?, last_logical = ? WHERE singleton = 1',
        },
        {
          parameters: [JSON.stringify(clocks), Date.now(), sourceId],
          sql: 'UPDATE shelf_sources SET deleted = 1, field_clocks_json = ?, updated_at = ? WHERE id = ?',
        },
        {
          parameters: [operation.id, operation.actorId, sourceId, operation.clock, JSON.stringify(operation.fields), clockPhysical(operation.clock)],
          sql: `
            INSERT INTO shelf_source_operations (id, actor_id, source_id, clock, fields_json, pending, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)
          `,
        },
        { parameters: [sourceId], sql: 'DELETE FROM shelf_pages WHERE source_id = ?' },
      ])
    })
  }

  async getCachedPage(sourceId: string, url: string): Promise<CachedShelfPage | null> {
    assertNonEmpty(sourceId, 'Shelf source id')
    const normalizedUrl = validateRemoteUrl(url)
    const row = await this.#database.get<ShelfPageRow>(`
      SELECT source_id, url, page_json, etag, last_modified, fetched_at
      FROM shelf_pages
      WHERE source_id = ? AND url = ?
    `, [sourceId, normalizedUrl])
    return row
      ? {
          etag: row.etag,
          fetchedAt: row.fetched_at,
          lastModified: row.last_modified,
          page: parsePage(row.page_json),
          sourceId: row.source_id,
          url: row.url,
        }
      : null
  }

  async getSource(sourceId: string): Promise<StoredShelfSource | null> {
    assertNonEmpty(sourceId, 'Shelf source id')
    const row = await this.#sourceRow(sourceId)
    return row && row.deleted === 0 ? toStoredSource(row) : null
  }

  async listPendingOperations(limit = 100): Promise<readonly ShelfSourceOperation[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new RangeError('Shelf operation limit must be between 1 and 1000')
    const rows = await this.#database.all<ShelfOperationRow>(`
      SELECT id, actor_id, source_id, clock, fields_json
      FROM shelf_source_operations
      WHERE pending = 1
      ORDER BY clock ASC, id ASC
      LIMIT ?
    `, [limit])
    return rows.map(operationFromRow)
  }

  async listSources(): Promise<readonly StoredShelfSource[]> {
    const rows = await this.#database.all<ShelfSourceRow>(`
      SELECT
        id, kind, url, name, username, auth, enabled, order_key,
        encrypted_password, deleted, field_clocks_json, added_at, updated_at
      FROM shelf_sources
      WHERE deleted = 0
      ORDER BY enabled DESC, order_key ASC, id ASC
    `)
    return rows.map(toStoredSource)
  }

  async mergeOperations(operations: readonly ShelfSourceOperation[]): Promise<void> {
    if (operations.length === 0)
      return
    operations.forEach(validateOperation)
    await this.#serializeWrite(async () => {
      for (const operation of [...operations].sort((left, right) => left.clock.localeCompare(right.clock))) {
        const received = await this.#database.get<{ id: string }>(
          'SELECT id FROM shelf_source_operations WHERE id = ?',
          [operation.id],
        )
        if (received)
          continue
        const row = await this.#sourceRow(operation.sourceId)
        const current = row ? toStoredSource(row) : null
        if (current === null) {
          const required = ['auth', 'deleted', 'enabled', 'name', 'orderKey', 'url', 'username'] as const
          if (required.some(field => !(field in operation.fields)))
            throw new TypeError(`Shelf operation ${operation.id} cannot create an incomplete source`)
        }
        const clocks = current
          ? { ...current.fieldClocks }
          : Object.fromEntries(sourceFields.map(field => [field, ''])) as unknown as Record<ShelfSourceField, string>
        const values = current
          ? { ...publicSource(current), deleted: row?.deleted === 1 }
          : {
              addedAt: clockPhysical(operation.clock),
              auth: 'none' as const,
              deleted: false,
              enabled: true,
              id: operation.sourceId,
              kind: 'opds' as const,
              name: '',
              orderKey: operation.clock,
              updatedAt: clockPhysical(operation.clock),
              url: '',
              username: null,
            }
        for (const field of sourceFields) {
          const value = operation.fields[field]
          if (value === undefined || operation.clock <= clocks[field])
            continue
          Object.assign(values, { [field]: value })
          clocks[field] = operation.clock
        }
        validateSource(values)
        const observed = await this.#nextClock(operation.clock)
        await this.#database.batch([
          {
            parameters: [observed.state.last_physical, observed.state.last_logical],
            sql: 'UPDATE shelf_sync_state SET last_physical = ?, last_logical = ? WHERE singleton = 1',
          },
          {
            parameters: [
              values.id,
              values.kind,
              values.url,
              values.name,
              values.username,
              values.auth,
              values.enabled ? 1 : 0,
              values.orderKey,
              values.deleted ? 1 : 0,
              JSON.stringify(clocks),
              values.addedAt,
              Math.max(values.updatedAt, clockPhysical(operation.clock)),
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
          {
            parameters: [operation.id, operation.actorId, operation.sourceId, operation.clock, JSON.stringify(operation.fields), clockPhysical(operation.clock)],
            sql: `
              INSERT INTO shelf_source_operations (id, actor_id, source_id, clock, fields_json, pending, created_at)
              VALUES (?, ?, ?, ?, ?, 0, ?)
            `,
          },
        ])
      }
    })
  }

  async savePage(page: CachedShelfPage): Promise<void> {
    assertNonEmpty(page.sourceId, 'Shelf page source id')
    const normalizedUrl = validateRemoteUrl(page.url)
    await this.#serializeWrite(() => this.#database.run(`
      INSERT INTO shelf_pages (source_id, url, page_json, etag, last_modified, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id, url) DO UPDATE SET
        page_json = excluded.page_json,
        etag = excluded.etag,
        last_modified = excluded.last_modified,
        fetched_at = excluded.fetched_at
    `, [page.sourceId, normalizedUrl, JSON.stringify(page.page), page.etag, page.lastModified, page.fetchedAt]))
  }

  async saveSource(input: SaveShelfSourceInput): Promise<void> {
    validateSource(input.source)
    const saved = structuredClone(input)
    saved.source.url = validateRemoteUrl(saved.source.url)
    await this.#serializeWrite(async () => {
      const row = await this.#sourceRow(saved.source.id)
      const current = row ? toStoredSource(row) : null
      const fields = changedFields(current, saved.source)
      if (Object.keys(fields).length === 0) {
        await this.#database.run(
          'UPDATE shelf_sources SET encrypted_password = ? WHERE id = ?',
          [saved.encryptedPassword, saved.source.id],
        )
        return
      }
      const next = await this.#nextClock()
      const clocks = current
        ? { ...current.fieldClocks }
        : Object.fromEntries(sourceFields.map(field => [field, next.clock])) as unknown as Record<ShelfSourceField, string>
      for (const field of Object.keys(fields) as ShelfSourceField[])
        clocks[field] = next.clock
      const operation: ShelfSourceOperation = {
        actorId: next.actorId,
        clock: next.clock,
        fields,
        id: createUuidV7(),
        sourceId: saved.source.id,
      }
      await this.#database.batch([
        {
          parameters: [next.state.last_physical, next.state.last_logical],
          sql: 'UPDATE shelf_sync_state SET last_physical = ?, last_logical = ? WHERE singleton = 1',
        },
        {
          parameters: [
            saved.source.id,
            saved.source.kind,
            saved.source.url,
            saved.source.name,
            saved.source.username,
            saved.source.auth,
            saved.source.enabled ? 1 : 0,
            saved.source.orderKey,
            saved.encryptedPassword,
            JSON.stringify(clocks),
            saved.source.addedAt,
            saved.source.updatedAt,
          ],
          sql: `
            INSERT INTO shelf_sources (
              id, kind, url, name, username, auth, enabled, order_key,
              encrypted_password, deleted, field_clocks_json, added_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              kind = excluded.kind,
              url = excluded.url,
              name = excluded.name,
              username = excluded.username,
              auth = excluded.auth,
              enabled = excluded.enabled,
              order_key = excluded.order_key,
              encrypted_password = excluded.encrypted_password,
              deleted = 0,
              field_clocks_json = excluded.field_clocks_json,
              updated_at = excluded.updated_at
          `,
        },
        {
          parameters: [operation.id, operation.actorId, operation.sourceId, operation.clock, JSON.stringify(operation.fields), clockPhysical(operation.clock)],
          sql: `
            INSERT INTO shelf_source_operations (id, actor_id, source_id, clock, fields_json, pending, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)
          `,
        },
      ])
    })
  }
}

export async function createShelfStorage(options: CreateShelfStorageOptions): Promise<ShelfStorage> {
  return DefaultShelfStorage.create(options)
}
