import { Buffer } from 'node:buffer'
import { LoroDoc } from 'loro-crdt'
import { describe, expect, it } from 'vitest'
import { mergeAuthoritativeNoteSnapshot } from './authoritative'

function encode(value: Uint8Array): string {
  let result = ''
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  for (let index = 0; index < value.length; index += 3) {
    const first = value[index]!
    const second = value[index + 1]
    const third = value[index + 2]
    result += alphabet[first >> 2]
    result += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)]
    if (second === undefined)
      break
    result += alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)]
    if (third === undefined)
      break
    result += alphabet[third & 63]
  }
  return result.replaceAll('+', '-').replaceAll('/', '_')
}

describe('authoritative note merge', () => {
  it('merges a snapshot and subsequent Loro update into a recoverable snapshot', () => {
    const source = new LoroDoc()
    const map = source.getMap('note')
    map.set('title', 'first')
    source.commit()
    const initial = mergeAuthoritativeNoteSnapshot(null, encode(source.export({ mode: 'snapshot' })))

    map.set('title', 'second')
    source.commit()
    const merged = mergeAuthoritativeNoteSnapshot(initial.snapshot, encode(source.export({ mode: 'update' })))
    const restored = new LoroDoc()
    restored.import(new Uint8Array(Buffer.from(merged.snapshot, 'base64url')))

    expect(restored.getMap('note').get('title')).toBe('second')
    expect(Object.keys(merged.frontier).length).toBeGreaterThan(0)
  })

  it('rejects malformed or empty updates before CRDT import', () => {
    expect(() => mergeAuthoritativeNoteSnapshot(null, '')).toThrow()
    expect(() => mergeAuthoritativeNoteSnapshot(null, 'not base64!')).toThrow()
  })
})
