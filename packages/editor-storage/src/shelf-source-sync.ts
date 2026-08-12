import type {
  ShelfSource,
  ShelfSourceField,
  ShelfSourceFieldClocks,
  ShelfSourceOperation,
  StoredShelfSource,
} from '@memorilo/shelf'
import { assertNonEmpty } from './editor-storage-shared'

const sourceFields = ['auth', 'deleted', 'enabled', 'name', 'orderKey', 'url', 'username'] as const

type MutableShelfSourceFields = {
  -readonly [Field in keyof ShelfSourceOperation['fields']]: ShelfSourceOperation['fields'][Field]
}

export interface ShelfSourceSnapshot {
  deleted: boolean
  fieldClocks: ShelfSourceFieldClocks
  source: StoredShelfSource
}

export interface MergedShelfSource {
  deleted: boolean
  fieldClocks: ShelfSourceFieldClocks
  source: ShelfSource
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

function validateSource(source: ShelfSource): void {
  assertNonEmpty(source.id, 'Shelf source id')
  assertNonEmpty(source.name, 'Shelf source name')
  assertNonEmpty(source.orderKey, 'Shelf source order key')
  const url = new URL(source.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new TypeError('Shelf source URL must use HTTP or HTTPS')
  if (source.kind !== 'opds')
    throw new TypeError(`Unsupported Shelf source kind: ${String(source.kind)}`)
  if (source.auth === 'basic' && source.username === null)
    throw new TypeError('A Basic-authenticated Shelf source requires a username')
  if (!Number.isSafeInteger(source.addedAt) || source.addedAt < 0)
    throw new RangeError('Shelf source addedAt must be a non-negative integer')
  if (!Number.isSafeInteger(source.updatedAt) || source.updatedAt < source.addedAt)
    throw new RangeError('Shelf source updatedAt must be an integer no earlier than addedAt')
}

export function validateShelfSourceOperation(operation: ShelfSourceOperation): void {
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

/** Applies one last-writer-wins operation without touching persistence. */
export function mergeShelfSourceOperation(
  snapshot: ShelfSourceSnapshot | null,
  operation: ShelfSourceOperation,
): MergedShelfSource {
  validateShelfSourceOperation(operation)
  const current = snapshot?.source
  if (current === null || current === undefined) {
    const required = ['auth', 'deleted', 'enabled', 'name', 'orderKey', 'url', 'username'] as const
    if (required.some(field => !(field in operation.fields)))
      throw new TypeError(`Shelf operation ${operation.id} cannot create an incomplete source`)
  }

  const clocks = snapshot
    ? { ...snapshot.fieldClocks }
    : Object.fromEntries(sourceFields.map(field => [field, ''])) as unknown as Record<ShelfSourceField, string>
  const values = current
    ? { ...current, deleted: snapshot.deleted }
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

  const { deleted, encryptedPassword: _encryptedPassword, fieldClocks: _fieldClocks, ...source } = values as typeof values & {
    encryptedPassword?: Uint8Array | null
    fieldClocks?: ShelfSourceFieldClocks
  }
  validateSource(source)
  return {
    deleted: deleted === true,
    fieldClocks: clocks as ShelfSourceFieldClocks,
    source,
  }
}

export function changedShelfSourceFields(
  current: StoredShelfSource | null,
  next: ShelfSource,
): ShelfSourceOperation['fields'] {
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

export { clockLogical, clockPhysical, sourceFields, validateSource }
