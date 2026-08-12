import type { ResolvedReaderSource } from './source'
import { describe, expect, it } from 'vitest'
import { ReaderSourceZipReader } from './zip-reader'

function source(byteLength: number): ResolvedReaderSource {
  return {
    byteLength,
    format: 'cbz',
    name: 'test.cbz',
    read: async (offset, length) => new Uint8Array(length).fill(offset),
  }
}

describe('reader source ZIP reader', () => {
  it('preserves exact read lengths at the end of the source', async () => {
    const reader = new ReaderSourceZipReader(source(10))

    await expect(reader.readUint8Array(8, 2)).resolves.toHaveLength(2)
    await expect(reader.readUint8Array(10, 0)).resolves.toHaveLength(0)
  })

  it('rejects reads that extend past the source', async () => {
    const reader = new ReaderSourceZipReader(source(10))

    expect(() => reader.readUint8Array(9, 2)).toThrow('exceeds the source size')
  })
})
