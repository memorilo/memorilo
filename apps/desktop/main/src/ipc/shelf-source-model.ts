import type {
  ShelfRequestCredentials,
  ShelfSource,
  StoredShelfSource,
} from '@memorilo/shelf'

export interface ShelfCredentialAccess {
  encrypt: (password: string) => Uint8Array
  read: (source: StoredShelfSource) => ShelfRequestCredentials | undefined
}

export function normalizeShelfSourceUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new TypeError('Book source URL must use HTTP or HTTPS')
  return url.href
}

export function toPublicShelfSource(source: StoredShelfSource): ShelfSource {
  const { encryptedPassword: _encryptedPassword, fieldClocks: _fieldClocks, ...value } = source
  return value
}
