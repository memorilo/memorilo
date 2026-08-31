import { LoroDoc } from 'loro-crdt'

const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export interface MergedNoteSnapshot {
  readonly snapshot: string
  readonly frontier: Readonly<Record<string, number>>
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[\w-]+$/u.test(value) || value.length % 4 === 1)
    throw new TypeError('Sync note update is not valid base64url')
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  const bytes: number[] = []
  let accumulator = 0
  let bits = 0
  for (const character of normalized) {
    if (character === '=')
      break
    const digit = base64Alphabet.indexOf(character)
    if (digit < 0)
      throw new TypeError('Sync note update is not valid base64url')
    accumulator = (accumulator << 6) | digit
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((accumulator >> bits) & 0xFF)
    }
  }
  if (bytes.length === 0)
    throw new TypeError('Sync note update must not be empty')
  return new Uint8Array(bytes)
}

function encodeBase64Url(value: Uint8Array): string {
  let result = ''
  for (let index = 0; index < value.length; index += 3) {
    const first = value[index]!
    const second = value[index + 1]
    const third = value[index + 2]
    result += base64Alphabet[first >> 2]
    result += base64Alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)]
    if (second === undefined)
      break
    result += base64Alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)]
    if (third === undefined)
      break
    result += base64Alphabet[third & 63]
  }
  return result.replaceAll('+', '-').replaceAll('/', '_')
}

/** Merge a Note Loro snapshot/update without depending on the desktop process or editor projection. */
export function mergeAuthoritativeNoteSnapshot(previousSnapshot: string | null, update: string): MergedNoteSnapshot {
  const doc = new LoroDoc()
  if (previousSnapshot !== null)
    doc.import(decodeBase64Url(previousSnapshot))
  doc.import(decodeBase64Url(update))
  const frontier: Record<string, number> = {}
  for (const entry of doc.frontiers())
    frontier[entry.peer] = Math.max(frontier[entry.peer] ?? 0, entry.counter)
  return {
    frontier,
    snapshot: encodeBase64Url(doc.export({ mode: 'snapshot' })),
  }
}
