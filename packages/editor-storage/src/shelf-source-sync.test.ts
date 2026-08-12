import type { ShelfSourceOperation, StoredShelfSource } from '@memorilo/shelf'
import { describe, expect, it } from 'vitest'
import { mergeShelfSourceOperation, validateShelfSourceOperation } from './shelf-source-sync'

const source: StoredShelfSource = {
  addedAt: 1,
  auth: 'none',
  enabled: true,
  encryptedPassword: null,
  fieldClocks: {
    auth: '0000000000001:00000000:actor',
    deleted: '0000000000001:00000000:actor',
    enabled: '0000000000001:00000000:actor',
    name: '0000000000001:00000000:actor',
    orderKey: '0000000000001:00000000:actor',
    url: '0000000000001:00000000:actor',
    username: '0000000000001:00000000:actor',
  },
  id: 'source-1',
  kind: 'opds',
  name: 'Shelf',
  orderKey: '001',
  updatedAt: 1,
  url: 'https://example.com/catalog',
  username: null,
}

function operation(overrides: Partial<ShelfSourceOperation> = {}): ShelfSourceOperation {
  return {
    actorId: 'actor',
    clock: '0000000000002:00000000:actor',
    fields: { name: 'Renamed' },
    id: 'operation-1',
    sourceId: source.id,
    ...overrides,
  }
}

describe('shelf source synchronization model', () => {
  it('applies newer fields while preserving unrelated values and clocks', () => {
    const result = mergeShelfSourceOperation({ deleted: false, fieldClocks: source.fieldClocks, source }, operation())

    expect(result.source.name).toBe('Renamed')
    expect(result.source.url).toBe(source.url)
    expect(result.fieldClocks.name).toBe(operation().clock)
    expect(result.fieldClocks.url).toBe(source.fieldClocks.url)
  })

  it('ignores stale field updates without moving their clocks', () => {
    const result = mergeShelfSourceOperation({ deleted: false, fieldClocks: source.fieldClocks, source }, operation({
      clock: '0000000000000:00000000:actor',
      fields: { name: 'Stale' },
    }))

    expect(result.source.name).toBe(source.name)
    expect(result.fieldClocks.name).toBe(source.fieldClocks.name)
  })

  it('requires a complete source when an operation creates one', () => {
    expect(() => mergeShelfSourceOperation(null, operation())).toThrow('incomplete source')
  })

  it('rejects malformed operations before applying them', () => {
    expect(() => validateShelfSourceOperation(operation({ fields: {} }))).toThrow('at least one field')
    expect(() => validateShelfSourceOperation(operation({ clock: 'invalid' }))).toThrow('Invalid Shelf operation clock')
  })
})
