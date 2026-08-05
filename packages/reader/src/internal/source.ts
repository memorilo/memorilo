import type { ReaderFormat, ReaderSource, ReaderSourceData } from '../types'
import {
  assertReadingFormat,
  detectReadingFormat,
  readingFormatDefaultName,
} from '@memorilo/reading-format'

const formatSignatureByteLength = 8

export interface ResolvedReaderSource {
  byteLength: number
  format: ReaderFormat
  name: string
  read: (offset: number, length: number) => Promise<Uint8Array>
}

function assertByteLength(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0)
    throw new RangeError('Reader source byteLength must be a non-negative safe integer')
}

function assertRange(byteLength: number, offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0)
    throw new RangeError('Reader source offset must be a non-negative safe integer')
  if (!Number.isSafeInteger(length) || length < 0)
    throw new RangeError('Reader source length must be a non-negative safe integer')
  if (offset > byteLength || length > byteLength - offset)
    throw new RangeError(`Reader source range ${offset}..${offset + length} exceeds ${byteLength} bytes`)
}

function sourceDataByteLength(data: ReaderSourceData): number {
  return data instanceof Blob ? data.size : data.byteLength
}

function readSourceData(data: ReaderSourceData, offset: number, length: number): Promise<Uint8Array> {
  const end = offset + length
  if (data instanceof Blob)
    return data.slice(offset, end).arrayBuffer().then(buffer => new Uint8Array(buffer))
  if (data instanceof Uint8Array)
    return Promise.resolve(data.slice(offset, end))
  return Promise.resolve(new Uint8Array(data, offset, length).slice())
}

function randomAccessReader(source: ReaderSource): Pick<ResolvedReaderSource, 'byteLength' | 'read'> {
  if ('data' in source && source.data !== undefined) {
    const byteLength = sourceDataByteLength(source.data)
    assertByteLength(byteLength)
    return {
      byteLength,
      read: (offset, length) => {
        assertRange(byteLength, offset, length)
        return readSourceData(source.data, offset, length)
      },
    }
  }

  const byteLength = source.byteLength
  assertByteLength(byteLength)
  return {
    byteLength,
    read: async (offset, length) => {
      assertRange(byteLength, offset, length)
      const bytes = await source.read(offset, length)
      if (!(bytes instanceof Uint8Array))
        throw new TypeError('Reader source read() must resolve to a Uint8Array')
      if (bytes.byteLength !== length)
        throw new Error(`Reader source returned ${bytes.byteLength} bytes for a ${length}-byte range`)
      return bytes
    },
  }
}

export async function readSourceBytes(source: ResolvedReaderSource): Promise<Uint8Array> {
  return source.read(0, source.byteLength)
}

export async function resolveSource(source: ReaderSource): Promise<ResolvedReaderSource> {
  const randomAccess = randomAccessReader(source)
  if (randomAccess.byteLength === 0)
    throw new Error('The selected document is empty')

  let format: ReaderFormat
  if (source.format === undefined) {
    const prefix = await randomAccess.read(
      0,
      Math.min(randomAccess.byteLength, formatSignatureByteLength),
    )
    const detected = detectReadingFormat(prefix, source.name)
    if (detected === null)
      throw new Error('Unsupported document. Select a PDF, EPUB, TXT, CBZ, or CBR file')
    format = detected
  }
  else {
    assertReadingFormat(source.format)
    format = source.format
  }

  const providedName = source.name === undefined ? '' : source.name.trim()
  return {
    ...randomAccess,
    format,
    name: providedName.length > 0 ? providedName : readingFormatDefaultName(format),
  }
}
