import type { SyncObjectMetadata } from '@memorilo/sync'
import { objectKeyFor } from '@memorilo/sync'

export function ensureAccountKey(accountId: string, key: string): void {
  if (!accountId || !key.startsWith(`tenants/${accountId}/`))
    throw new Error('Object key does not belong to the requested account')
}

export function assertMetadata(metadata: SyncObjectMetadata): void {
  const expectedKey = objectKeyFor(metadata.accountId, metadata.generation, metadata.contentHash)
  if (metadata.namespace !== 'assets' || metadata.key !== expectedKey)
    throw new TypeError('Object metadata does not match its content-addressed key')
  if (!Number.isSafeInteger(metadata.contentLength) || metadata.contentLength < 0)
    throw new TypeError('Object content length must be a non-negative safe integer')
}

export function sameMetadata(left: SyncObjectMetadata, right: SyncObjectMetadata): boolean {
  return left.accountId === right.accountId
    && left.generation === right.generation
    && left.key === right.key
    && left.contentHash === right.contentHash
    && left.contentLength === right.contentLength
    && left.contentType === right.contentType
}
