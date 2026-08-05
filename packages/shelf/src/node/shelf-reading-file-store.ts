import type { BookFileBinding, BookMetadataSnapshot } from '@memorilo/reading-model'
import type {
  ShelfReadingDocument,
  ShelfReadingFormat,
  ShelfReadingRangeInput,
  ShelfReadingRetention,
} from '../model'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  mkdir,
  open as openFile,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  assertReadingFormat,
  readingFormatExtension,
  readingFormatFromFileName,
} from '@memorilo/reading-format'
import { assertBookFileSha256 } from '@memorilo/reading-model'

const defaultMaximumBookCacheBytes = 256 * 1024 * 1024
const readingIdPattern = /^[a-f0-9]{64}$/u
const manifestFileName = 'manifest.json'
const manifestSchemaVersion = 1
const invalidFileNameCharacters = /[<>:"/\\|?*]/gu
const reservedWindowsFileName = /^(?:aux|com[1-9]|con|lpt[1-9]|nul|prn)(?:\.|$)/iu

export type ShelfReadingFileLocation = 'cache' | 'library' | 'missing'

export interface CreateShelfReadingFileStoreOptions {
  cacheDirectory: string
  libraryDirectory: string
  maximumCacheBytes?: number
}

export interface SaveShelfReadingFileInput {
  book: BookMetadataSnapshot
  bytes: Uint8Array
  format: ShelfReadingFormat
  name: string
  publicationId: string
  readingId: string
  retention: ShelfReadingRetention
  sourceId: string
}

export interface ShelfReadingFileStore {
  deleteLibrary: (readingId: string) => Promise<boolean>
  getLocation: (readingId: string) => Promise<ShelfReadingFileLocation>
  open: (readingId: string) => Promise<ShelfReadingDocument | null>
  promote: (readingId: string) => Promise<boolean>
  readRange: (input: ShelfReadingRangeInput) => Promise<Uint8Array>
  save: (input: SaveShelfReadingFileInput) => Promise<void>
}

interface StoredDocument {
  book: BookFileBinding
  format: ShelfReadingFormat
  name: string
  path: string
}

interface CacheEntry extends StoredDocument {
  byteSize: number
  lastAccessedAt: number
  readingId: string
}

interface StoredReadingManifest {
  book: BookFileBinding
  fileName: string
  schemaVersion: number
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
}

function assertReadingId(readingId: string): void {
  if (!readingIdPattern.test(readingId))
    throw new TypeError('Shelf reading id must be a lowercase SHA-256 digest')
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be a non-negative safe integer`)
}

function assertFileByteLength(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0)
    throw new RangeError('Shelf publication byte length exceeds the supported range')
}

function validateBookBinding(value: unknown, description: string): asserts value is BookFileBinding {
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw new TypeError(`${description} must be an object`)
  const binding = value as Partial<BookFileBinding>
  if (binding.book === null || Array.isArray(binding.book) || typeof binding.book !== 'object')
    throw new TypeError(`${description} publication metadata must be an object`)
  assertNonEmpty(binding.book.title, `${description} publication title`)
  if (!Array.isArray(binding.book.authors))
    throw new TypeError(`${description} authors must be an array`)
  binding.book.authors.forEach((author, index) => assertNonEmpty(author, `${description} author ${index}`))
  if (binding.file === null || Array.isArray(binding.file) || typeof binding.file !== 'object')
    throw new TypeError(`${description} file must be an object`)
  assertReadingFormat(binding.file.format)
  assertBookFileSha256(binding.file.sha256)
  if (!Number.isSafeInteger(binding.file.byteLength) || binding.file.byteLength < 1)
    throw new RangeError(`${description} byte length must be a positive safe integer`)
  assertNonEmpty(binding.file.originalName, `${description} original name`)
  if (!Array.isArray(binding.retrievalHints) || binding.retrievalHints.length === 0)
    throw new TypeError(`${description} must contain a retrieval hint`)
  for (const [index, hint] of binding.retrievalHints.entries()) {
    if (hint === null || Array.isArray(hint) || typeof hint !== 'object')
      throw new TypeError(`${description} retrieval hint ${index} must be an object`)
    assertNonEmpty(hint.readingId, `${description} retrieval hint ${index} reading id`)
    if (hint.kind !== 'shelf')
      throw new TypeError(`${description} retrieval hint ${index} must be a Shelf locator`)
    assertNonEmpty(hint.publicationId, `${description} retrieval hint ${index} publication id`)
    assertNonEmpty(hint.sourceId, `${description} retrieval hint ${index} source id`)
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function truncateUtf8(value: string, maximumBytes: number): string {
  let byteLength = 0
  let result = ''
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character)
    if (byteLength + characterBytes > maximumBytes)
      break
    result += character
    byteLength += characterBytes
  }
  return result
}

function sanitizedFileName(name: string, format: ShelfReadingFormat): string {
  const trimmedName = name.trim()
  const existingFormat = readingFormatFromFileName(trimmedName)
  const withoutExtension = existingFormat === null
    ? trimmedName
    : trimmedName.slice(0, trimmedName.lastIndexOf('.'))
  const withoutControlCharacters = [...withoutExtension]
    .map(character => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127 ? ' ' : character)
    .join('')
  const normalized = withoutControlCharacters
    .replace(invalidFileNameCharacters, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/[. ]+$/gu, '')
    .trim()
  let stem = normalized.length > 0 ? truncateUtf8(normalized, 160) : 'Untitled'
  if (reservedWindowsFileName.test(stem))
    stem = `_${stem}`
  return `${stem}.${readingFormatExtension(format)}`
}

async function directoryEntries(path: string) {
  try {
    return await readdir(path, { withFileTypes: true })
  }
  catch (error) {
    if (isNotFound(error))
      return []
    throw error
  }
}

async function storedDocument(directory: string): Promise<StoredDocument | null> {
  let manifestText: string
  try {
    manifestText = await readFile(join(directory, manifestFileName), 'utf8')
  }
  catch (error) {
    if (isNotFound(error))
      return null
    throw error
  }
  const value: unknown = JSON.parse(manifestText)
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw new TypeError(`Shelf reading manifest must be an object: ${directory}`)
  const manifest = value as Partial<StoredReadingManifest>
  if (manifest.schemaVersion !== manifestSchemaVersion)
    throw new Error(`Unsupported Shelf reading manifest version in ${directory}`)
  if (typeof manifest.fileName !== 'string' || basename(manifest.fileName) !== manifest.fileName)
    throw new TypeError(`Shelf reading manifest has an invalid file name: ${directory}`)
  validateBookBinding(manifest.book, `Shelf reading manifest ${directory}`)
  const format = readingFormatFromFileName(manifest.fileName)
  if (format !== manifest.book.file.format)
    throw new Error(`Shelf reading manifest format does not match its file name: ${directory}`)
  const path = join(directory, manifest.fileName)
  const file = await stat(path)
  if (!file.isFile())
    throw new Error(`Shelf reading manifest does not reference a file: ${directory}`)
  if (file.size !== manifest.book.file.byteLength)
    throw new Error(`Shelf reading file length does not match its manifest: ${directory}`)
  return {
    book: structuredClone(manifest.book),
    format,
    name: manifest.fileName,
    path,
  }
}

async function removePartFile(path: string, originalError: unknown): Promise<never> {
  try {
    await rm(path, { force: true })
  }
  catch (cleanupError) {
    throw new AggregateError([originalError, cleanupError], 'Shelf publication write and cleanup both failed')
  }
  throw originalError
}

async function atomicWrite(path: string, bytes: Uint8Array): Promise<void> {
  const partPath = `${path}.${randomUUID()}.part`
  try {
    await writeFile(partPath, bytes, { flag: 'wx' })
    await rename(partPath, path)
  }
  catch (error) {
    await removePartFile(partPath, error)
  }
}

async function atomicCopy(source: string, destination: string): Promise<void> {
  const partPath = `${destination}.${randomUUID()}.part`
  try {
    await copyFile(source, partPath)
    await rename(partPath, destination)
  }
  catch (error) {
    await removePartFile(partPath, error)
  }
}

function storedManifest(book: BookFileBinding, fileName: string): StoredReadingManifest {
  return {
    book: structuredClone(book),
    fileName,
    schemaVersion: manifestSchemaVersion,
  }
}

async function writeManifest(directory: string, book: BookFileBinding, fileName: string): Promise<void> {
  const bytes = Buffer.from(JSON.stringify(storedManifest(book, fileName)), 'utf8')
  await atomicWrite(join(directory, manifestFileName), bytes)
}

async function replaceReadingDirectory(
  destination: string,
  write: (temporaryDirectory: string) => Promise<void>,
): Promise<void> {
  const temporaryDirectory = `${destination}.${randomUUID()}.part`
  await mkdir(temporaryDirectory, { recursive: false })
  try {
    await write(temporaryDirectory)
    await rm(destination, { force: true, recursive: true })
    await rename(temporaryDirectory, destination)
  }
  catch (error) {
    try {
      await rm(temporaryDirectory, { force: true, recursive: true })
    }
    catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Shelf publication directory write and cleanup both failed')
    }
    throw error
  }
}

function createBookBinding(input: SaveShelfReadingFileInput, fileName: string): BookFileBinding {
  const binding: BookFileBinding = {
    book: structuredClone(input.book),
    file: {
      byteLength: input.bytes.byteLength,
      format: input.format,
      originalName: fileName,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
    },
    retrievalHints: [{
      kind: 'shelf',
      publicationId: input.publicationId,
      readingId: input.readingId,
      sourceId: input.sourceId,
    }],
  }
  validateBookBinding(binding, 'Shelf reading binding')
  return binding
}

export function createShelfReadingId(
  sourceId: string,
  publicationId: string,
  format: ShelfReadingFormat,
): string {
  assertNonEmpty(sourceId, 'Shelf source id')
  assertNonEmpty(publicationId, 'Shelf publication id')
  assertReadingFormat(format)
  return createHash('sha256')
    .update('memorilo-shelf-reading-v1\0')
    .update(sourceId)
    .update('\0')
    .update(publicationId)
    .update('\0')
    .update(format)
    .digest('hex')
}

class DefaultShelfReadingFileStore implements ShelfReadingFileStore {
  readonly #cacheDirectory: string
  readonly #libraryDirectory: string
  readonly #maximumCacheBytes: number
  #writeQueue: Promise<void> = Promise.resolve()

  private constructor(options: Required<CreateShelfReadingFileStoreOptions>) {
    assertNonEmpty(options.cacheDirectory, 'Shelf reading cache directory')
    assertNonEmpty(options.libraryDirectory, 'Shelf reading library directory')
    if (!Number.isSafeInteger(options.maximumCacheBytes) || options.maximumCacheBytes < 1)
      throw new RangeError('Shelf reading cache maximum size must be a positive safe integer')
    this.#cacheDirectory = options.cacheDirectory
    this.#libraryDirectory = options.libraryDirectory
    this.#maximumCacheBytes = options.maximumCacheBytes
  }

  static async create(options: CreateShelfReadingFileStoreOptions): Promise<DefaultShelfReadingFileStore> {
    const store = new DefaultShelfReadingFileStore({
      ...options,
      maximumCacheBytes: options.maximumCacheBytes ?? defaultMaximumBookCacheBytes,
    })
    await Promise.all([
      mkdir(store.#cacheDirectory, { recursive: true }),
      mkdir(store.#libraryDirectory, { recursive: true }),
    ])
    await store.#pruneCache()
    return store
  }

  async #document(baseDirectory: string, readingId: string): Promise<StoredDocument | null> {
    return storedDocument(join(baseDirectory, readingId))
  }

  async #location(readingId: string): Promise<ShelfReadingFileLocation> {
    if (await this.#document(this.#libraryDirectory, readingId))
      return 'library'
    if (await this.#document(this.#cacheDirectory, readingId))
      return 'cache'
    return 'missing'
  }

  async #pruneCache(preservedReadingId?: string): Promise<void> {
    const directories = await directoryEntries(this.#cacheDirectory)
    const cacheEntries: CacheEntry[] = []
    for (const directory of directories) {
      if (!directory.isDirectory() || !readingIdPattern.test(directory.name))
        continue
      const documentDirectory = join(this.#cacheDirectory, directory.name)
      const document = await storedDocument(documentDirectory)
      if (document === null) {
        await rm(documentDirectory, { force: true, recursive: true })
        continue
      }
      const fileStat = await stat(document.path)
      cacheEntries.push({
        ...document,
        byteSize: fileStat.size,
        lastAccessedAt: fileStat.mtimeMs,
        readingId: directory.name,
      })
    }

    let totalBytes = cacheEntries.reduce((total, entry) => total + entry.byteSize, 0)
    const oldestFirst = [...cacheEntries].sort((left, right) => (
      left.lastAccessedAt - right.lastAccessedAt || left.readingId.localeCompare(right.readingId)
    ))
    for (const entry of oldestFirst) {
      if (totalBytes <= this.#maximumCacheBytes)
        break
      if (entry.readingId === preservedReadingId)
        continue
      await rm(join(this.#cacheDirectory, entry.readingId), { force: true, recursive: true })
      totalBytes -= entry.byteSize
    }
  }

  async #serializeWrite<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#writeQueue.then(operation)
    this.#writeQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async deleteLibrary(readingId: string): Promise<boolean> {
    assertReadingId(readingId)
    return this.#serializeWrite(async () => {
      const directory = join(this.#libraryDirectory, readingId)
      if (await storedDocument(directory) === null)
        return false
      await rm(directory, { recursive: true })
      return true
    })
  }

  async getLocation(readingId: string): Promise<ShelfReadingFileLocation> {
    assertReadingId(readingId)
    return this.#serializeWrite(() => this.#location(readingId))
  }

  async open(readingId: string): Promise<ShelfReadingDocument | null> {
    assertReadingId(readingId)
    return this.#serializeWrite(async () => {
      const libraryDocument = await this.#document(this.#libraryDirectory, readingId)
      const document = libraryDocument ?? await this.#document(this.#cacheDirectory, readingId)
      if (document === null)
        return null
      if (libraryDocument === null) {
        const now = new Date()
        await utimes(document.path, now, now)
      }
      const byteLength = (await stat(document.path)).size
      assertFileByteLength(byteLength)
      return {
        book: structuredClone(document.book),
        byteLength,
        format: document.format,
        name: document.name,
      }
    })
  }

  async readRange(input: ShelfReadingRangeInput): Promise<Uint8Array> {
    assertReadingId(input.readingId)
    assertNonNegativeSafeInteger(input.offset, 'Shelf reading range offset')
    assertNonNegativeSafeInteger(input.length, 'Shelf reading range length')
    return this.#serializeWrite(async () => {
      const document = await this.#document(this.#libraryDirectory, input.readingId)
        ?? await this.#document(this.#cacheDirectory, input.readingId)
      if (document === null)
        throw new Error(`Shelf reading file is missing: ${input.readingId}`)

      const handle = await openFile(document.path, 'r')
      try {
        const byteLength = (await handle.stat()).size
        assertFileByteLength(byteLength)
        if (input.offset > byteLength || input.length > byteLength - input.offset) {
          throw new RangeError(
            `Shelf reading range ${input.offset}:${input.length} exceeds the ${byteLength}-byte publication`,
          )
        }

        const bytes = new Uint8Array(input.length)
        const { bytesRead } = await handle.read(bytes, 0, input.length, input.offset)
        if (bytesRead !== input.length) {
          throw new Error(
            `Shelf reading range short read: expected ${input.length} bytes but received ${bytesRead}`,
          )
        }
        return bytes
      }
      finally {
        await handle.close()
      }
    })
  }

  async promote(readingId: string): Promise<boolean> {
    assertReadingId(readingId)
    return this.#serializeWrite(async () => {
      if (await this.#document(this.#libraryDirectory, readingId))
        return true
      const cached = await this.#document(this.#cacheDirectory, readingId)
      if (cached === null)
        return false
      const libraryReadingDirectory = join(this.#libraryDirectory, readingId)
      await replaceReadingDirectory(libraryReadingDirectory, async (temporaryDirectory) => {
        await atomicCopy(cached.path, join(temporaryDirectory, cached.name))
        await writeManifest(temporaryDirectory, cached.book, cached.name)
      })
      await rm(join(this.#cacheDirectory, readingId), { recursive: true })
      return true
    })
  }

  async save(input: SaveShelfReadingFileInput): Promise<void> {
    assertReadingId(input.readingId)
    assertReadingFormat(input.format)
    assertNonEmpty(input.name, 'Shelf publication name')
    assertNonEmpty(input.book.title, 'Shelf publication title')
    input.book.authors.forEach((author, index) => assertNonEmpty(author, `Shelf publication author ${index}`))
    assertNonEmpty(input.publicationId, 'Shelf publication id')
    assertNonEmpty(input.sourceId, 'Shelf source id')
    if (input.bytes.byteLength === 0)
      throw new TypeError('Shelf publication must contain bytes')
    if (input.retention !== 'cache' && input.retention !== 'library')
      throw new TypeError(`Unsupported Shelf reading retention: ${String(input.retention)}`)

    await this.#serializeWrite(async () => {
      if (await this.#document(this.#libraryDirectory, input.readingId))
        return
      if (input.retention === 'library') {
        const cached = await this.#document(this.#cacheDirectory, input.readingId)
        if (cached) {
          const libraryReadingDirectory = join(this.#libraryDirectory, input.readingId)
          await replaceReadingDirectory(libraryReadingDirectory, async (temporaryDirectory) => {
            await atomicCopy(cached.path, join(temporaryDirectory, cached.name))
            await writeManifest(temporaryDirectory, cached.book, cached.name)
          })
          await rm(join(this.#cacheDirectory, input.readingId), { recursive: true })
          return
        }
      }

      const baseDirectory = input.retention === 'cache' ? this.#cacheDirectory : this.#libraryDirectory
      const readingDirectory = join(baseDirectory, input.readingId)
      const existing = await storedDocument(readingDirectory)
      if (existing) {
        if (input.retention === 'cache') {
          const now = new Date()
          await utimes(existing.path, now, now)
          await this.#pruneCache(input.readingId)
        }
        return
      }

      const name = sanitizedFileName(input.name, input.format)
      const book = createBookBinding(input, name)
      await replaceReadingDirectory(readingDirectory, async (temporaryDirectory) => {
        await atomicWrite(join(temporaryDirectory, name), input.bytes)
        await writeManifest(temporaryDirectory, book, name)
      })
      if (input.retention === 'cache')
        await this.#pruneCache(input.readingId)
    })
  }
}

export async function createShelfReadingFileStore(
  options: CreateShelfReadingFileStoreOptions,
): Promise<ShelfReadingFileStore> {
  return DefaultShelfReadingFileStore.create(options)
}
