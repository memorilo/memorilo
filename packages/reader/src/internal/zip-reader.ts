import type { ResolvedReaderSource } from './source'
import { Reader } from '@zip.js/zip.js'

export class ReaderSourceZipReader extends Reader<ResolvedReaderSource> {
  constructor(private readonly source: ResolvedReaderSource) {
    super(source)
    this.size = source.byteLength
  }

  override readUint8Array(index: number, length: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(index) || index < 0 || index > this.size)
      throw new RangeError(`ZIP read offset ${index} is outside the source`)
    if (!Number.isSafeInteger(length) || length < 0)
      throw new RangeError('ZIP read length must be a non-negative safe integer')
    return this.source.read(index, Math.min(length, this.size - index))
  }
}
