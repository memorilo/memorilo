import type { ReaderAnnotation, ReaderPosition } from '@memorilo/editor/reader'
import type { BookFileBinding, ReadingFormat } from '@memorilo/reading-model'
import {
  assertBookFileBinding,
  assertBookFileSha256,
  assertReadingFormat,
  detectReadingFormat,
  readingFormatDefinitions,
} from '@memorilo/reading-model'
import { createShelfReadingId } from '@memorilo/shelf'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { Directory, File, FileMode, Paths } from 'expo-file-system'

const manifestSchemaVersion = 2
const cacheDirectoryName = 'cache'
const libraryDirectoryName = 'library'
const legacyDirectoryName = 'memorilo-readings'
const maxCacheBytes = 256 * 1024 * 1024

type MobileReadingLocation = 'cache' | 'library'

interface StoredMobileReading {
  annotations: readonly ReaderAnnotation[]
  book: BookFileBinding | null
  byteLength: number
  fileName: string
  format: ReadingFormat
  id: string
  importedAt: number
  lastAccessedAt: number
  name: string
  noteId: string | null
  originalName: string
  position: ReaderPosition | null
  sha256: string | null
  topicId: string | null
}

interface ReadingManifest {
  readings: readonly StoredMobileReading[]
  schemaVersion: number
}

export interface MobileReading extends Omit<StoredMobileReading, 'fileName'> {
  location: MobileReadingLocation
  uri: string
}

export interface MobileReadingCacheSummary {
  activeCount: number
  cachedBytes: number
  cachedCount: number
}

export interface MobileReadingCacheCleanupResult {
  bytesFreed: number
  removedCount: number
}

interface SaveBytesInput {
  book: BookFileBinding | null
  bytes: Uint8Array
  format: ReadingFormat
  id: string
  name: string
  originalName: string
  retention: MobileReadingLocation
}

interface SaveShelfReadingInput {
  authors: readonly string[]
  bytes: Uint8Array
  format: ReadingFormat
  name: string
  originalName?: string
  publicationId: string
  readingId?: string
  retention: MobileReadingLocation
  sourceId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireString(value: unknown, description: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new TypeError(`${description} must be a non-empty string`)
  return value
}

function requireNumber(value: unknown, description: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0))
    throw new TypeError(`${description} must be a ${positive ? 'positive' : 'non-negative'} safe integer`)
  return value
}

function optionalString(value: unknown, description: string): string | null {
  return value === undefined || value === null ? null : requireString(value, description)
}

function validFileName(value: unknown, description: string): string {
  const fileName = requireString(value, description)
  if (fileName === '.' || fileName === '..' || fileName.includes('/') || fileName.includes('\\'))
    throw new TypeError(`${description} must be a file name`)
  return fileName
}

function parseStoredReading(value: unknown, index: number): StoredMobileReading {
  if (!isRecord(value))
    throw new TypeError(`Mobile reading ${index} must be an object`)
  assertReadingFormat(value.format)
  if (!Array.isArray(value.annotations))
    throw new TypeError(`Mobile reading ${index} annotations must be an array`)
  if (value.position !== null && value.position !== undefined && !isRecord(value.position))
    throw new TypeError(`Mobile reading ${index} position must be an object or null`)
  const sha256 = optionalString(value.sha256, `Mobile reading ${index} SHA-256`)
  if (sha256 !== null)
    assertBookFileSha256(sha256)
  const noteId = optionalString(value.noteId, `Mobile reading ${index} Note id`)
  const topicId = optionalString(value.topicId, `Mobile reading ${index} Topic id`)
  if ((noteId === null) !== (topicId === null))
    throw new TypeError(`Mobile reading ${index} must bind its Note and Topic together`)
  const book = value.book === undefined || value.book === null ? null : value.book
  if (book !== null) {
    assertBookFileBinding(book, `Mobile reading ${index} book binding`)
    if (sha256 !== book.file.sha256)
      throw new TypeError(`Mobile reading ${index} book binding hash does not match the file hash`)
  }
  return {
    annotations: value.annotations as readonly ReaderAnnotation[],
    book,
    byteLength: requireNumber(value.byteLength, `Mobile reading ${index} byte length`, true),
    fileName: validFileName(value.fileName, `Mobile reading ${index} file name`),
    format: value.format,
    id: requireString(value.id, `Mobile reading ${index} id`),
    importedAt: requireNumber(value.importedAt, `Mobile reading ${index} import time`),
    lastAccessedAt: requireNumber(value.lastAccessedAt ?? value.importedAt, `Mobile reading ${index} last access time`),
    name: requireString(value.name, `Mobile reading ${index} name`),
    noteId,
    originalName: value.originalName === undefined
      ? requireString(value.name, `Mobile reading ${index} original name`)
      : requireString(value.originalName, `Mobile reading ${index} original name`),
    position: (value.position ?? null) as ReaderPosition | null,
    sha256,
    topicId,
  }
}

function parseManifest(value: unknown, description: string): StoredMobileReading[] {
  // Version 1 was the old single-directory array manifest. It is accepted only
  // during migration; new manifests are versioned objects in cache/library.
  if (Array.isArray(value))
    return value.map(parseStoredReading)
  if (!isRecord(value) || value.schemaVersion !== manifestSchemaVersion || !Array.isArray(value.readings))
    throw new TypeError(`${description} has an unsupported schema`)
  return value.readings.map((reading, index) => parseStoredReading(reading, index))
}

function displayName(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf('.')
  const base = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName
  return base.trim() || fileName
}

function digestBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes))
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

function bookBinding(input: SaveShelfReadingInput, readingId: string, originalName: string, hash: string): BookFileBinding {
  const book: BookFileBinding = {
    book: {
      authors: [...input.authors],
      title: requireString(input.name, 'Shelf publication title'),
    },
    file: {
      byteLength: input.bytes.byteLength,
      format: input.format,
      originalName,
      sha256: hash,
    },
    retrievalHints: [{
      kind: 'shelf',
      publicationId: requireString(input.publicationId, 'Shelf publication id'),
      readingId,
      sourceId: requireString(input.sourceId, 'Shelf source id'),
    }],
  }
  assertBookFileBinding(book, 'Shelf reading binding', {
    requireRetrievalHint: true,
    requireShelfRetrievalHint: true,
  })
  return book
}

export class MobileReadingLibrary {
  readonly #cache: Directory
  readonly #library: Directory
  readonly #cacheManifest: File
  readonly #libraryManifest: File
  #cacheReadings: StoredMobileReading[]
  #libraryReadings: StoredMobileReading[]
  #validated = new Map<string, { modificationTime: number, sha256: string, size: number }>()
  #activeSessions = new Map<string, number>()
  #mutation: Promise<void> = Promise.resolve()

  private constructor(
    cache: Directory,
    library: Directory,
    cacheReadings: StoredMobileReading[],
    libraryReadings: StoredMobileReading[],
  ) {
    this.#cache = cache
    this.#library = library
    this.#cacheManifest = new File(cache, 'manifest.json')
    this.#libraryManifest = new File(library, 'manifest.json')
    this.#cacheReadings = cacheReadings
    this.#libraryReadings = libraryReadings
  }

  static async open(): Promise<MobileReadingLibrary> {
    const root = new Directory(Paths.document, legacyDirectoryName)
    const cache = new Directory(root, cacheDirectoryName)
    const library = new Directory(root, libraryDirectoryName)
    root.create({ idempotent: true, intermediates: true })
    cache.create({ idempotent: true, intermediates: true })
    library.create({ idempotent: true, intermediates: true })

    const cacheReadings = await MobileReadingLibrary.readManifest(new File(cache, 'manifest.json'), 'Mobile reading cache manifest')
    let libraryReadings = await MobileReadingLibrary.readManifest(new File(library, 'manifest.json'), 'Mobile reading library manifest')
    const legacyManifest = new File(root, 'library.json')
    if (legacyManifest.exists && libraryReadings.length === 0) {
      const legacy = parseManifest(JSON.parse(await legacyManifest.text()), 'Legacy mobile reading library manifest')
      const migrated: StoredMobileReading[] = []
      for (const reading of legacy) {
        const source = new File(root, reading.fileName)
        if (!source.exists)
          throw new Error(`Legacy mobile reading file ${reading.fileName} is missing`)
        const destination = new File(library, reading.fileName)
        if (!destination.exists)
          await source.copy(destination)
        migrated.push(reading)
      }
      libraryReadings = migrated
    }

    const result = new MobileReadingLibrary(cache, library, cacheReadings, libraryReadings)
    await result.#validateAndRecover('cache')
    await result.#validateAndRecover('library')
    const libraryIds = new Set(result.#libraryReadings.map(reading => reading.id))
    for (const reading of result.#cacheReadings.filter(candidate => libraryIds.has(candidate.id))) {
      const file = new File(cache, reading.fileName)
      if (file.exists)
        file.delete()
      result.#removeInMemory(reading.id, 'cache')
    }
    await result.#pruneCache()
    await result.#persist('cache')
    await result.#persist('library')
    return result
  }

  private static async readManifest(file: File, description: string): Promise<StoredMobileReading[]> {
    if (!file.exists)
      return []
    const parsed: unknown = JSON.parse(await file.text())
    const readings = parseManifest(parsed, description)
    const ids = new Set(readings.map(reading => reading.id))
    if (ids.size !== readings.length)
      throw new Error(`${description} contains duplicate ids`)
    return readings
  }

  async close(): Promise<void> {
    await this.#mutation
    await this.#persist('cache')
    await this.#persist('library')
  }

  get(readingId: string): MobileReading {
    const located = this.#locate(readingId)
    if (!located)
      throw new Error(`Mobile reading ${readingId} does not exist`)
    const file = new File(located.location === 'cache' ? this.#cache : this.#library, located.reading.fileName)
    if (!file.exists)
      throw new Error(`Mobile reading file ${located.reading.fileName} is missing`)
    return this.#public(located.reading, located.location, file)
  }

  list(): readonly MobileReading[] {
    const seen = new Set<string>()
    const readings: MobileReading[] = []
    for (const entries of [this.#libraryReadings, this.#cacheReadings]) {
      for (const reading of entries) {
        if (seen.has(reading.id))
          continue
        seen.add(reading.id)
        try {
          readings.push(this.get(reading.id))
        }
        catch {
          // Invalid or missing cache files are removed asynchronously on the next find/open.
        }
      }
    }
    return readings.sort((left, right) => right.importedAt - left.importedAt)
  }

  getCacheSummary(): MobileReadingCacheSummary {
    return {
      activeCount: this.#cacheReadings.reduce(
        (count, reading) => count + ((this.#activeSessions.get(reading.id) ?? 0) > 0 ? 1 : 0),
        0,
      ),
      cachedBytes: this.#cacheReadings.reduce((total, reading) => total + reading.byteLength, 0),
      cachedCount: this.#cacheReadings.length,
    }
  }

  async clearUnusedCache(): Promise<MobileReadingCacheCleanupResult> {
    return this.#run(async () => {
      let bytesFreed = 0
      let removedCount = 0
      for (const reading of [...this.#cacheReadings]) {
        if ((this.#activeSessions.get(reading.id) ?? 0) > 0)
          continue
        const file = new File(this.#cache, reading.fileName)
        if (file.exists)
          file.delete()
        this.#removeInMemory(reading.id, 'cache')
        bytesFreed += reading.byteLength
        removedCount += 1
      }
      if (removedCount > 0)
        await this.#persist('cache')
      return { bytesFreed, removedCount }
    })
  }

  async find(readingId: string): Promise<MobileReading | null> {
    return this.#run(async () => {
      const located = await this.#findValidated(readingId)
      return located ? this.#public(located.reading, located.location, located.file) : null
    })
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
    const reading = await this.#saveCopiedFile({
      book: null,
      byteLength,
      format,
      hash: digestFile(source, byteLength),
      id: crypto.randomUUID(),
      name: displayName(source.name),
      originalName: source.name,
      retention: 'library',
      source,
    })
    return reading
  }

  async saveDownloaded(input: {
    bytes: Uint8Array
    format: ReadingFormat
    name: string
    originalName?: string
  }): Promise<MobileReading> {
    assertReadingFormat(input.format)
    const name = requireString(input.name, 'Downloaded reading name')
    if (input.bytes.length < 1)
      throw new RangeError('Downloaded reading must contain bytes')
    return this.#saveBytes({
      book: null,
      bytes: input.bytes,
      format: input.format,
      id: crypto.randomUUID(),
      name,
      originalName: input.originalName === undefined
        ? `${name}.${input.format}`
        : requireString(input.originalName, 'Downloaded reading original name'),
      retention: 'library',
    })
  }

  async saveShelfReading(input: SaveShelfReadingInput): Promise<MobileReading> {
    assertReadingFormat(input.format)
    if (input.bytes.length < 1)
      throw new RangeError('Shelf publication must contain bytes')
    const id = input.readingId ?? createShelfReadingId(input.sourceId, input.publicationId, input.format)
    const originalName = input.originalName === undefined
      ? `${input.name}.${input.format}`
      : requireString(input.originalName, 'Shelf reading original name')
    const hash = digestBytes(input.bytes)
    return this.#saveBytes({
      book: bookBinding(input, id, originalName, hash),
      bytes: input.bytes,
      format: input.format,
      id,
      name: requireString(input.name, 'Shelf publication name'),
      originalName,
      retention: input.retention,
    })
  }

  async retainInLibrary(readingId: string): Promise<MobileReading | null> {
    return this.#run(async () => {
      return (await this.#retainInLibrary(readingId))?.reading ?? null
    })
  }

  async deleteFromLibrary(readingId: string): Promise<boolean> {
    return this.#run(async () => {
      if ((this.#activeSessions.get(readingId) ?? 0) > 0)
        throw new Error('This reading cannot be deleted while it is open')
      const reading = this.#libraryReadings.find(candidate => candidate.id === readingId)
      if (!reading)
        return false
      const file = new File(this.#library, reading.fileName)
      if (file.exists)
        file.delete()
      this.#libraryReadings = this.#libraryReadings.filter(candidate => candidate.id !== readingId)
      await this.#persist('library')
      return true
    })
  }

  beginSession(readingId: string): void {
    this.get(readingId)
    this.#activeSessions.set(readingId, (this.#activeSessions.get(readingId) ?? 0) + 1)
  }

  endSession(readingId: string): void {
    const count = this.#activeSessions.get(readingId) ?? 0
    if (count <= 1)
      this.#activeSessions.delete(readingId)
    else
      this.#activeSessions.set(readingId, count - 1)
  }

  async readRange(readingId: string, offset: number, length: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new RangeError('Reading range offset must be a non-negative safe integer')
    if (!Number.isSafeInteger(length) || length < 0)
      throw new RangeError('Reading range length must be a non-negative safe integer')
    return this.#run(async () => {
      const located = await this.#findValidated(readingId)
      if (!located)
        throw new Error(`Reading file ${readingId} is missing`)
      if (offset + length > located.reading.byteLength)
        throw new RangeError(`Reading range exceeds ${located.reading.name}`)
      located.reading.lastAccessedAt = Date.now()
      const handle = located.file.open(FileMode.ReadOnly)
      try {
        handle.offset = offset
        return handle.readBytes(length)
      }
      finally {
        handle.close()
      }
    })
  }

  async bindContext(input: { noteId: string, readingId: string, topicId: string }): Promise<void> {
    await this.#run(async () => {
      const located = this.#locate(input.readingId)
      if (!located)
        throw new Error(`Mobile reading ${input.readingId} does not exist`)
      const previous = { noteId: located.reading.noteId, topicId: located.reading.topicId }
      located.reading.noteId = requireString(input.noteId, 'Book Note id')
      located.reading.topicId = requireString(input.topicId, 'Book Topic id')
      try {
        await this.#persist(located.location)
      }
      catch (error) {
        located.reading.noteId = previous.noteId
        located.reading.topicId = previous.topicId
        throw error
      }
    })
  }

  async saveState(input: {
    annotations: readonly ReaderAnnotation[]
    position: ReaderPosition | null
    readingId: string
  }): Promise<void> {
    await this.#run(async () => {
      const located = this.#locate(input.readingId)
      if (!located)
        throw new Error(`Mobile reading ${input.readingId} does not exist`)
      located.reading.annotations = input.annotations
      located.reading.position = input.position
      await this.#persist(located.location)
    })
  }

  async #saveBytes(input: SaveBytesInput): Promise<MobileReading> {
    return this.#run(async () => {
      const existing = await this.#findValidated(input.id)
      if (existing) {
        if (existing.reading.byteLength !== input.bytes.byteLength || existing.reading.sha256 !== digestBytes(input.bytes))
          throw new Error(`Mobile reading ${input.id} already exists with different content`)
        if (input.retention === 'library' && existing.location === 'cache') {
          const promoted = await this.#retainInLibrary(input.id)
          if (!promoted)
            throw new Error(`Mobile reading ${input.id} disappeared during library promotion`)
          return promoted.reading
        }
        return this.#public(existing.reading, existing.location, existing.file)
      }
      const hash = input.book?.file.sha256 ?? digestBytes(input.bytes)
      if (input.book !== null && (input.book.file.byteLength !== input.bytes.byteLength || input.book.file.sha256 !== hash))
        throw new Error('Shelf reading bytes do not match their book binding')
      const reading: StoredMobileReading = {
        annotations: [],
        book: input.book,
        byteLength: input.bytes.byteLength,
        fileName: `${input.id}.${input.format}`,
        format: input.format,
        id: input.id,
        importedAt: Date.now(),
        lastAccessedAt: Date.now(),
        name: input.name,
        noteId: null,
        originalName: input.originalName,
        position: null,
        sha256: hash,
        topicId: null,
      }
      const directory = input.retention === 'cache' ? this.#cache : this.#library
      const file = new File(directory, reading.fileName)
      const part = new File(directory, `.${reading.fileName}.${crypto.randomUUID()}.part`)
      let moved = false
      part.create({ intermediates: true })
      try {
        part.write(input.bytes)
        await part.move(file, { overwrite: true })
        moved = true
        if (input.retention === 'cache')
          this.#cacheReadings = [...this.#cacheReadings, reading]
        else
          this.#libraryReadings = [...this.#libraryReadings, reading]
        try {
          await this.#persist(input.retention)
        }
        catch (error) {
          this.#removeInMemory(reading.id, input.retention)
          if (file.exists)
            file.delete()
          throw error
        }
      }
      finally {
        if (!moved && part.exists)
          part.delete()
      }
      if (input.retention === 'cache') {
        if (await this.#pruneCache(reading.id))
          await this.#persist('cache')
      }
      return this.#public(reading, input.retention, file)
    })
  }

  async #saveCopiedFile(input: {
    book: BookFileBinding | null
    byteLength: number
    format: ReadingFormat
    hash: string
    id: string
    name: string
    originalName: string
    retention: MobileReadingLocation
    source: File
  }): Promise<MobileReading> {
    return this.#run(async () => {
      const existing = await this.#findValidated(input.id)
      if (existing)
        return this.#public(existing.reading, existing.location, existing.file)
      const reading: StoredMobileReading = {
        annotations: [],
        book: input.book,
        byteLength: input.byteLength,
        fileName: `${input.id}.${input.format}`,
        format: input.format,
        id: input.id,
        importedAt: Date.now(),
        lastAccessedAt: Date.now(),
        name: input.name,
        noteId: null,
        originalName: input.originalName,
        position: null,
        sha256: input.hash,
        topicId: null,
      }
      const directory = input.retention === 'cache' ? this.#cache : this.#library
      const file = new File(directory, reading.fileName)
      const part = new File(directory, `.${reading.fileName}.${crypto.randomUUID()}.part`)
      let moved = false
      try {
        await input.source.copy(part, { overwrite: true })
        await part.move(file, { overwrite: true })
        moved = true
        if (input.retention === 'cache')
          this.#cacheReadings = [...this.#cacheReadings, reading]
        else
          this.#libraryReadings = [...this.#libraryReadings, reading]
        try {
          await this.#persist(input.retention)
        }
        catch (error) {
          this.#removeInMemory(reading.id, input.retention)
          if (file.exists)
            file.delete()
          throw error
        }
      }
      finally {
        if (!moved && part.exists)
          part.delete()
      }
      return this.#public(reading, input.retention, file)
    })
  }

  async #retainInLibrary(readingId: string): Promise<{ reading: MobileReading } | null> {
    const located = await this.#findValidated(readingId)
    if (!located)
      return null
    if (located.location === 'library')
      return { reading: this.#public(located.reading, 'library', located.file) }
    const destination = new File(this.#library, located.reading.fileName)
    if (!destination.exists) {
      await located.file.copy(destination)
    }
    else if (located.reading.sha256 !== null
      && digestFile(destination, located.reading.byteLength) !== located.reading.sha256) {
      throw new Error(`Mobile reading library file ${readingId} conflicts with its cache`)
    }
    this.#libraryReadings = [...this.#libraryReadings, located.reading]
    await this.#persist('library')
    this.#cacheReadings = this.#cacheReadings.filter(reading => reading.id !== readingId)
    if (located.file.exists)
      located.file.delete()
    await this.#persist('cache')
    return { reading: this.#public(located.reading, 'library', destination) }
  }

  #locate(readingId: string): { location: MobileReadingLocation, reading: StoredMobileReading } | null {
    const library = this.#libraryReadings.find(reading => reading.id === readingId)
    if (library)
      return { location: 'library', reading: library }
    const cache = this.#cacheReadings.find(reading => reading.id === readingId)
    return cache ? { location: 'cache', reading: cache } : null
  }

  async #findValidated(readingId: string): Promise<{ file: File, location: MobileReadingLocation, reading: StoredMobileReading } | null> {
    const located = this.#locate(readingId)
    if (!located)
      return null
    const file = new File(located.location === 'cache' ? this.#cache : this.#library, located.reading.fileName)
    try {
      this.#validateFile(file, located.reading)
      return { ...located, file }
    }
    catch (error) {
      if (located.location === 'cache') {
        this.#removeInMemory(readingId, 'cache')
        if (file.exists)
          file.delete()
        await this.#persist('cache')
        return null
      }
      throw error
    }
  }

  #validateFile(file: File, reading: StoredMobileReading): void {
    if (!file.exists)
      throw new Error(`Mobile reading file ${reading.fileName} is missing`)
    const info = file.info()
    const size = info.size
    if (size !== reading.byteLength)
      throw new Error(`Mobile reading file ${reading.id} length does not match its manifest`)
    const modificationTime = info.modificationTime ?? 0
    const cached = this.#validated.get(reading.id)
    if (cached?.size === size && cached.modificationTime === modificationTime && cached.sha256 === reading.sha256)
      return
    if (reading.sha256 !== null && digestFile(file, reading.byteLength) !== reading.sha256)
      throw new Error(`Mobile reading file ${reading.id} content does not match its manifest`)
    this.#validated.set(reading.id, { modificationTime, sha256: reading.sha256 ?? '', size })
  }

  async #validateAndRecover(location: MobileReadingLocation): Promise<void> {
    const entries = location === 'cache' ? this.#cacheReadings : this.#libraryReadings
    const valid: StoredMobileReading[] = []
    for (const reading of entries) {
      const file = new File(location === 'cache' ? this.#cache : this.#library, reading.fileName)
      try {
        this.#validateFile(file, reading)
        valid.push(reading)
      }
      catch (error) {
        if (location === 'library')
          throw error
        if (file.exists)
          file.delete()
      }
    }
    if (location === 'cache')
      this.#cacheReadings = valid
    else
      this.#libraryReadings = valid
  }

  async #pruneCache(preservedReadingId?: string): Promise<boolean> {
    let total = this.#cacheReadings.reduce((sum, reading) => sum + reading.byteLength, 0)
    let removed = false
    const oldestFirst = [...this.#cacheReadings].sort((left, right) => (
      left.lastAccessedAt - right.lastAccessedAt || left.id.localeCompare(right.id)
    ))
    for (const reading of oldestFirst) {
      if (total <= maxCacheBytes)
        break
      if (reading.id === preservedReadingId || (this.#activeSessions.get(reading.id) ?? 0) > 0)
        continue
      const file = new File(this.#cache, reading.fileName)
      if (file.exists)
        file.delete()
      this.#removeInMemory(reading.id, 'cache')
      total -= reading.byteLength
      removed = true
    }
    return removed
  }

  #public(reading: StoredMobileReading, location: MobileReadingLocation, file: File): MobileReading {
    return { ...reading, location, uri: file.uri }
  }

  #removeInMemory(readingId: string, location: MobileReadingLocation): void {
    this.#validated.delete(readingId)
    if (location === 'cache')
      this.#cacheReadings = this.#cacheReadings.filter(reading => reading.id !== readingId)
    else
      this.#libraryReadings = this.#libraryReadings.filter(reading => reading.id !== readingId)
  }

  async #persist(location: MobileReadingLocation): Promise<void> {
    const directory = location === 'cache' ? this.#cache : this.#library
    const manifest = location === 'cache' ? this.#cacheManifest : this.#libraryManifest
    const temporary = new File(directory, `.manifest.${crypto.randomUUID()}.tmp`)
    let moved = false
    temporary.create({ intermediates: true })
    try {
      temporary.write(JSON.stringify({
        readings: location === 'cache' ? this.#cacheReadings : this.#libraryReadings,
        schemaVersion: manifestSchemaVersion,
      } satisfies ReadingManifest))
      await temporary.move(manifest, { overwrite: true })
      moved = true
    }
    finally {
      if (!moved && temporary.exists)
        temporary.delete()
    }
  }

  #run<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#mutation.then(operation)
    this.#mutation = result.then(() => undefined, () => undefined)
    return result
  }
}
