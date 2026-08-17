import type { RatingHistory } from './types'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

function orderedHistories(histories: readonly RatingHistory[]): readonly RatingHistory[] {
  return [...histories].sort((left, right) => left.targetId.localeCompare(right.targetId))
}

export function fingerprintRatingHistories(histories: readonly RatingHistory[]): string {
  const facts = orderedHistories(histories).map(history => [
    history.targetId,
    history.ratings.map(rating => [rating.eventId, rating.occurredAt, rating.rating] as const),
  ] as const)
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(facts))))
}
