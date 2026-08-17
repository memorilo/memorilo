import type { ReaderAnnotation, ReaderPosition } from '@memorilo/editor/reader'
import type { ReadingFormat } from '@memorilo/reading-model'
import {
  assertBookFileSha256,
  assertReadingFormat,
  detectReadingFormat,
  readingFormatDefinitions,
} from '@memorilo/reading-model'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { Directory, File, FileMode, Paths } from 'expo-file-system'

interface StoredMobileReading {
  annotations: readonly ReaderAnnotation[]
  byteLength: number
  fileName: string
  format: ReadingFormat
  id: string
  importedAt: number
  name: string
  noteId: string | null
  originalName: string
  position: ReaderPosition | null
  sha256: string | null
  topicId: string | null
}

export interface MobileReading extends Omit<StoredMobileReading, 'fileName'> {
  uri: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireString(value: unknown, description: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new TypeError(`${description} must be a non-empty string`)
  return value
}

function requireNumber(value: unknown, description: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new TypeError(`${description} must be a non-negative safe integer`)
  return value
}

function optionalString(value: unknown, description: string): string | null {
  return value === undefined || value === null ? null : requireString(value, description)
}

function parseStoredReading(value: unknown, index: number): StoredMobileReading {
  if (!isRecord(value))
    throw new TypeError(`Mobile reading ${index} must be an object`)
  assertReadingFormat(value.format)
  if (!Array.isArray(value.annotations))
    throw new TypeError(`Mobile reading ${index} annotations must be an array`)
  if (value.position !== null && !isRecord(value.position))
    throw new TypeError(`Mobile reading ${index} position must be an object or null`)
  const sha256 = optionalString(value.sha256, `Mobile reading ${index} SHA-256`)
  if (sha256 !== null)
    assertBookFileSha256(sha256)
  const noteId = optionalString(value.noteId, `Mobile reading ${index} Note id`)
  const topicId = optionalString(value.topicId, `Mobile reading ${index} Topic id`)
  if ((noteId === null) !== (topicId === null))
    throw new TypeError(`Mobile reading ${index} must bind its Note and Topic together`)
  return {
    annotations: value.annotations as readonly ReaderAnnotation[],
    byteLength: requireNumber(value.byteLength, `Mobile reading ${index} byte length`),
    fileName: requireString(value.fileName, `Mobile reading ${index} file name`),
    format: value.format,
    id: requireString(value.id, `Mobile reading ${index} id`),
    importedAt: requireNumber(value.importedAt, `Mobile reading ${index} import time`),
    name: requireString(value.name, `Mobile reading ${index} name`),
    noteId,
    originalName: value.originalName === undefined
      ? requireString(value.name, `Mobile reading ${index} original name`)
      : requireString(value.originalName, `Mobile reading ${index} original name`),
    position: value.position as ReaderPosition | null,
    sha256,
    topicId,
  }
}

function displayName(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf('.')
  const base = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
  return base.trim() || fileName
}

function digestFile(file: File, byteLength: number): string {
  const digest = sha256.create()
  const handle = file.open(FileMode.ReadOnly)
  try {
    let remaining = byteLength
    while (remaining > 0) {
      const bytes = handle.readBytes(Math.min(remaining, 1024 * 1024))
      if (bytes.length === 0)
        throw new Error(`Reading file ${file.name} ended before ${byteLength} bytes`)
      digest.update(bytes)
      remaining -= bytes.length
    }
    return bytesToHex(digest.digest())
  }
  finally {
    handle.close()
  }
}

export class MobileReadingLibrary {
  readonly #directory: Directory
  readonly #manifest: File
  #mutation: Promise<void> = Promise.resolve()
  #readings: StoredMobileReading[]

  private constructor(directory: Directory, readings: StoredMobileReading[]) {
    this.#directory = directory
    this.#manifest = new File(directory, 'library.json')
    this.#readings = readings
  }

  static async open(): Promise<MobileReadingLibrary> {
    const directory = new Directory(Paths.document, 'memorilo-readings')
    directory.create({ idempotent: true, intermediates: true })
    const manifest = new File(directory, 'library.json')
    if (!manifest.exists)
      return new MobileReadingLibrary(directory, [])
    const parsed: unknown = JSON.parse(await manifest.text())
    if (!Array.isArray(parsed))
      throw new TypeError('Mobile reading library manifest must be an array')
    const readings = parsed.map(parseStoredReading)
    const ids = new Set(readings.map(reading => reading.id))
    if (ids.size !== readings.length)
      throw new Error('Mobile reading library contains duplicate ids')
    return new MobileReadingLibrary(directory, readings)
  }

  async close(): Promise<void> {
    await this.#mutation
  }

  get(readingId: string): MobileReading {
    const reading = this.#readings.find(candidate => candidate.id === readingId)
    if (!reading)
      throw new Error(`Mobile reading ${readingId} does not exist`)
    const file = new File(this.#directory, reading.fileName)
    if (!file.exists)
      throw new Error(`Mobile reading file ${reading.fileName} is missing`)
    return { ...reading, uri: file.uri }
  }

  list(): readonly MobileReading[] {
    return this.#readings
      .map(reading => this.get(reading.id))
      .sort((left, right) => right.importedAt - left.importedAt)
  }

  async importFromPicker(): Promise<MobileReading | null> {
    const picked = await File.pickFileAsync({
      mimeTypes: Object.values(readingFormatDefinitions).flatMap(definition => definition.mediaTypes),
    })
    if (picked.canceled)
      return null
    const source = picked.result
    const info = source.info()
    const byteLength = info.size
    if (byteLength === undefined || !Number.isSafeInteger(byteLength) || byteLength < 1)
      throw new Error(`Cannot determine the size of ${source.name}`)
    const handle = source.open(FileMode.ReadOnly)
    let header: Uint8Array
    try {
      header = handle.readBytes(Math.min(byteLength, 512))
    }
    finally {
      handle.close()
    }
    const format = detectReadingFormat(header, source.name)
    if (!format)
      throw new TypeError(`Unsupported reading file: ${source.name}`)
    const sha256 = digestFile(source, byteLength)
    const id = crypto.randomUUID()
    const fileName = `${id}.${format}`
    const destination = new File(this.#directory, fileName)
    await source.copy(destination)
    const originalName = source.name
    const name = displayName(originalName)
    const reading: StoredMobileReading = {
      annotations: [],
      byteLength,
      fileName,
      format,
      id,
      importedAt: Date.now(),
      name,
      noteId: null,
      originalName,
      position: null,
      sha256,
      topicId: null,
    }
    try {
      await this.#mutate(async () => {
        const previous = this.#readings
        this.#readings = [...previous, reading]
        try {
          await this.#persist()
        }
        catch (error) {
          this.#readings = previous
          throw error
        }
      })
    }
    catch (error) {
      if (destination.exists)
        destination.delete()
      throw error
    }
    return this.get(id)
  }

  async bindContext(input: { noteId: string, readingId: string, topicId: string }): Promise<void> {
    await this.#mutate(async () => {
      const index = this.#readings.findIndex(reading => reading.id === input.readingId)
      const current = this.#readings[index]
      if (!current)
        throw new Error(`Mobile reading ${input.readingId} does not exist`)
      const previous = this.#readings
      const next = [...previous]
      next[index] = {
        ...current,
        noteId: requireString(input.noteId, 'Book Note id'),
        topicId: requireString(input.topicId, 'Book Topic id'),
      }
      this.#readings = next
      try {
        await this.#persist()
      }
      catch (error) {
        this.#readings = previous
        throw error
      }
    })
  }

  async readRange(readingId: string, offset: number, length: number): Promise<Uint8Array> {
    const reading = this.get(readingId)
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new RangeError('Reading range offset must be a non-negative safe integer')
    if (!Number.isSafeInteger(length) || length < 0)
      throw new RangeError('Reading range length must be a non-negative safe integer')
    if (offset + length > reading.byteLength)
      throw new RangeError(`Reading range exceeds ${reading.name}`)
    const handle = new File(reading.uri).open(FileMode.ReadOnly)
    try {
      handle.offset = offset
      return handle.readBytes(length)
    }
    finally {
      handle.close()
    }
  }

  async saveState(input: {
    annotations: readonly ReaderAnnotation[]
    position: ReaderPosition | null
    readingId: string
  }): Promise<void> {
    await this.#mutate(async () => {
      const index = this.#readings.findIndex(reading => reading.id === input.readingId)
      const current = this.#readings[index]
      if (!current)
        throw new Error(`Mobile reading ${input.readingId} does not exist`)
      const previous = this.#readings
      const next = [...previous]
      next[index] = {
        ...current,
        annotations: input.annotations,
        position: input.position,
      }
      this.#readings = next
      try {
        await this.#persist()
      }
      catch (error) {
        this.#readings = previous
        throw error
      }
    })
  }

  async #mutate(operation: () => Promise<void>): Promise<void> {
    const result = this.#mutation.then(operation)
    this.#mutation = result.catch(() => undefined)
    return result
  }

  async #persist(): Promise<void> {
    const temporary = new File(this.#directory, `.library.${crypto.randomUUID()}.tmp`)
    temporary.create()
    try {
      temporary.write(JSON.stringify(this.#readings))
      await temporary.move(this.#manifest, { overwrite: true })
    }
    catch (error) {
      if (temporary.exists)
        temporary.delete()
      throw error
    }
  }
}
