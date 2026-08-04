import type {
  ShelfReadingDocument,
  ShelfReadingFormat,
  ShelfReadingRetention,
} from '../model'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { basename, join } from 'node:path'

const defaultMaximumBookCacheBytes = 256 * 1024 * 1024
const readingIdPattern = /^[a-f0-9]{64}$/u
const invalidFileNameCharacters = /[<>:"/\\|?*]/gu
const reservedWindowsFileName = /^(?:aux|com[1-9]|con|lpt[1-9]|nul|prn)(?:\.|$)/iu

export type ShelfReadingFileLocation = 'cache' | 'library' | 'missing'

export interface CreateShelfReadingFileStoreOptions {
  cacheDirectory: string
  libraryDirectory: string
  maximumCacheBytes?: number
}

export interface SaveShelfReadingFileInput {
  bytes: Uint8Array
  format: ShelfReadingFormat
  name: string
  readingId: string
  retention: ShelfReadingRetention
}

export interface ShelfReadingFileStore {
  deleteLibrary: (readingId: string) => Promise<boolean>
  getLocation: (readingId: string) => Promise<ShelfReadingFileLocation>
  open: (readingId: string) => Promise<ShelfReadingDocument | null>
  promote: (readingId: string) => Promise<boolean>
  save: (input: SaveShelfReadingFileInput) => Promise<void>
}

interface StoredDocument {
  format: ShelfReadingFormat
  name: string
  path: string
}

interface CacheEntry extends StoredDocument {
  byteSize: number
  lastAccessedAt: number
  readingId: string
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
}

function assertReadingId(readingId: string): void {
  if (!readingIdPattern.test(readingId))
    throw new TypeError('Shelf reading id must be a lowercase SHA-256 digest')
}

function assertFormat(format: string): asserts format is ShelfReadingFormat {
  if (format !== 'epub' && format !== 'pdf')
    throw new TypeError(`Unsupported Shelf reading format: ${format}`)
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
  const withoutExtension = name.trim().replace(/\.(?:epub|pdf)$/iu, '')
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
  return `${stem}.${format}`
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
  const entries = await directoryEntries(directory)
  const documents = entries.flatMap((entry): readonly StoredDocument[] => {
    if (!entry.isFile())
      return []
    const extension = entry.name.toLocaleLowerCase().split('.').at(-1)
    if (extension !== 'epub' && extension !== 'pdf')
      return []
    return [{ format: extension, name: entry.name, path: join(directory, entry.name) }]
  })
  if (documents.length > 1)
    throw new Error(`Shelf reading directory contains multiple publications: ${directory}`)
  return documents[0] ?? null
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

export function createShelfReadingId(
  sourceId: string,
  publicationId: string,
  format: ShelfReadingFormat,
): string {
  assertNonEmpty(sourceId, 'Shelf source id')
  assertNonEmpty(publicationId, 'Shelf publication id')
  assertFormat(format)
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
      const bytes = await readFile(document.path)
      return {
        bytes: new Uint8Array(bytes),
        format: document.format,
        name: document.name,
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
      await rm(libraryReadingDirectory, { force: true, recursive: true })
      await mkdir(libraryReadingDirectory, { recursive: true })
      await atomicCopy(cached.path, join(libraryReadingDirectory, basename(cached.path)))
      await rm(join(this.#cacheDirectory, readingId), { recursive: true })
      return true
    })
  }

  async save(input: SaveShelfReadingFileInput): Promise<void> {
    assertReadingId(input.readingId)
    assertFormat(input.format)
    assertNonEmpty(input.name, 'Shelf publication name')
    if (input.bytes.byteLength === 0)
      throw new TypeError('Shelf publication must contain bytes')

    await this.#serializeWrite(async () => {
      if (await this.#document(this.#libraryDirectory, input.readingId))
        return
      if (input.retention === 'library') {
        const cached = await this.#document(this.#cacheDirectory, input.readingId)
        if (cached) {
          const libraryReadingDirectory = join(this.#libraryDirectory, input.readingId)
          await rm(libraryReadingDirectory, { force: true, recursive: true })
          await mkdir(libraryReadingDirectory, { recursive: true })
          await atomicCopy(cached.path, join(libraryReadingDirectory, basename(cached.path)))
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

      await rm(readingDirectory, { force: true, recursive: true })
      await mkdir(readingDirectory, { recursive: true })
      const name = sanitizedFileName(input.name, input.format)
      await atomicWrite(join(readingDirectory, name), input.bytes)
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
