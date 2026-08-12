import type { ResolvedReaderSource } from './source'
import { Reader } from '@zip.js/zip.js'

export class ReaderSourceZipReader extends Reader<ResolvedReaderSource> {
  constructor(
    private readonly source: ResolvedReaderSource,
    private readonly signal?: AbortSignal,
  ) {
    super(source)
    this.size = source.byteLength
  }

  override readUint8Array(index: number, length: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(index) || index < 0 || index > this.size)
      throw new RangeError(`ZIP read offset ${index} is outside the source`)
    if (!Number.isSafeInteger(length) || length < 0)
      throw new RangeError('ZIP read length must be a non-negative safe integer')
    if (length > this.size - index)
      throw new RangeError(`ZIP read range ${index}-${index + length} exceeds the source size ${this.size}`)
    return this.source.read(index, length, this.signal)
  }
}
