import type {
  SaveShelfSourceAndPageInput,
  SaveShelfSourceInput,
  ShelfSourceField,
  ShelfSourceOperation,
  StoredShelfSource,
} from '@memorilo/shelf'
import type { DatabaseCommand, EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import { assertNonEmpty } from './editor-storage-shared'
import { saveShelfPageCommand } from './shelf-page-cache-repository'
import { ShelfSourcePersistence } from './shelf-source-persistence'
import {
  changedShelfSourceFields,
  sourceFields,
  validateShelfSourceOperation,
  validateSource,
} from './shelf-source-sync'
import { normalizeShelfRemoteUrl } from './shelf-storage-shared'

export class ShelfSourceRepository {
  readonly #database: EditorStorageDatabase
  readonly #persistence: ShelfSourcePersistence
  readonly #runOperation: StorageOperationRunner

  constructor(
    database: EditorStorageDatabase,
    runOperation: StorageOperationRunner,
  ) {
    this.#database = database
    this.#persistence = new ShelfSourcePersistence(database)
    this.#runOperation = runOperation
  }

  async acknowledgeOperations(operationIds: readonly string[]): Promise<void> {
    const savedOperationIds = [...operationIds]
    savedOperationIds.forEach(operationId => assertNonEmpty(operationId, 'Shelf operation id'))
    return this.#runOperation(() => this.#persistence.acknowledge(savedOperationIds))
  }

  async delete(sourceId: string): Promise<void> {
    assertNonEmpty(sourceId, 'Shelf source id')
    return this.#runOperation(async () => {
      const record = await this.#persistence.read(sourceId)
      if (!record)
        throw new Error(`Unknown Shelf source: ${sourceId}`)
      const prepared = await this.#persistence.prepareLocalOperation(sourceId, { deleted: true })
      const clocks = { ...record.source.fieldClocks, deleted: prepared.clock }
      await this.#database.batch([
        prepared.syncStateCommand,
        {
          parameters: [JSON.stringify(clocks), Date.now(), sourceId],
          sql: 'UPDATE shelf_sources SET deleted = 1, field_clocks_json = ?, updated_at = ? WHERE id = ?',
        },
        prepared.operationCommand,
        { parameters: [sourceId], sql: 'DELETE FROM shelf_pages WHERE source_id = ?' },
      ])
    })
  }

  async get(sourceId: string): Promise<StoredShelfSource | null> {
    assertNonEmpty(sourceId, 'Shelf source id')
    return this.#runOperation(async () => {
      const record = await this.#persistence.read(sourceId)
      return record && !record.deleted ? record.source : null
    })
  }

  async list(): Promise<readonly StoredShelfSource[]> {
    return this.#runOperation(() => this.#persistence.listActive())
  }

  async listPendingOperations(limit = 100): Promise<readonly ShelfSourceOperation[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new RangeError('Shelf operation limit must be between 1 and 1000')
    return this.#runOperation(() => this.#persistence.listPending(limit))
  }

  async mergeOperations(operations: readonly ShelfSourceOperation[]): Promise<void> {
    operations.forEach(validateShelfSourceOperation)
    const saved = structuredClone(operations)
    return this.#runOperation(() => this.#persistence.merge(saved))
  }

  async #sourceCommands(input: SaveShelfSourceInput): Promise<readonly DatabaseCommand[]> {
    validateSource(input.source)
    const saved = {
      ...input,
      source: {
        ...input.source,
        url: normalizeShelfRemoteUrl(input.source.url, 'Shelf source URL'),
      },
    }
    const record = await this.#persistence.read(saved.source.id)
    const current = record?.source ?? null
    const changedFields = changedShelfSourceFields(current, saved.source)
    const fields: ShelfSourceOperation['fields'] = record?.deleted
      ? { ...changedFields, deleted: false }
      : changedFields
    if (Object.keys(fields).length === 0) {
      return [{
        parameters: [saved.encryptedPassword, saved.source.id],
        sql: 'UPDATE shelf_sources SET encrypted_password = ? WHERE id = ?',
      }]
    }

    const prepared = await this.#persistence.prepareLocalOperation(saved.source.id, fields)
    const clocks = current
      ? { ...current.fieldClocks }
      : Object.fromEntries(sourceFields.map(field => [field, prepared.clock])) as unknown as Record<ShelfSourceField, string>
    for (const field of Object.keys(fields) as ShelfSourceField[])
      clocks[field] = prepared.clock

    return [
      prepared.syncStateCommand,
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
      prepared.operationCommand,
    ]
  }

  async save(input: SaveShelfSourceInput): Promise<void> {
    const saved = structuredClone(input)
    return this.#runOperation(async () => {
      await this.#database.batch(await this.#sourceCommands(saved))
    })
  }

  async saveWithPage(input: SaveShelfSourceAndPageInput): Promise<void> {
    if (input.page.sourceId !== input.source.id)
      throw new TypeError('Shelf source and page must use the same source id')
    const saved = structuredClone(input)
    return this.#runOperation(async () => {
      await this.#database.batch([
        ...(await this.#sourceCommands(saved)),
        saveShelfPageCommand(saved.page),
      ])
    })
  }
}
