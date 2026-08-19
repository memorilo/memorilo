import type { ShelfReadingFormat } from './model'
import { assertReadingFormat } from '@memorilo/reading-model'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

const encoder = new TextEncoder()
const readingIdPrefix = 'memorilo-shelf-reading-v1\0'

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
}

/** Returns the stable locator used by every platform for a Shelf rendition. */
export function createShelfReadingId(
  sourceId: string,
  publicationId: string,
  format: ShelfReadingFormat,
): string {
  assertNonEmpty(sourceId, 'Shelf source id')
  assertNonEmpty(publicationId, 'Shelf publication id')
  assertReadingFormat(format)
  return bytesToHex(sha256(encoder.encode(
    `${readingIdPrefix}${sourceId}\0${publicationId}\0${format}`,
  )))
}
