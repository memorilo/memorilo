import type { BookFileBinding, BookMetadataSnapshot } from '@memorilo/reading-model'
import type {
  ShelfReadingDocument,
  ShelfReadingFormat,
  ShelfReadingRangeInput,
  ShelfReadingRetention,
} from '../model'
import type { StoredReadingDocument } from './reading-directory'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { combineLifecycleFailures, createOperationSupervisor } from '@memorilo/effect-lifecycle'
import {
  assertBookFileBinding,
  assertReadingFormat,
  readingFormatExtension,
  readingFormatFromFileName,
} from '@memorilo/reading-model'
import {
  InvalidShelfReadingDocumentError,
  ReadingDirectory,
  readStoredReadingRange,
} from './reading-directory'

const defaultMaximumBookCacheBytes = 256 * 1024 * 1024
const invalidFileNameCharacters = /[<>:"/\\|?*]/gu
const readingIdPattern = /^[a-f0-9]{64}$/u
const reservedWindowsFileName = /^(?:aux|com[1-9]|con|lpt[1-9]|nul|prn)(?:\.|$)/iu

export type ShelfReadingFileLocation = 'cache' | 'library'

export interface ShelfReadingFileStoreOptions {
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

export interface ShelfReadingFile {
  document: ShelfReadingDocument
  location: ShelfReadingFileLocation
}

interface LocatedStoredDocument {
  document: StoredReadingDocument
  location: ShelfReadingFileLocation
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
  assertBookFileBinding(binding, 'Shelf reading binding', {
    requireRetrievalHint: true,
    requireShelfRetrievalHint: true,
  })
  return binding
}

function pathContains(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
}

function assertSeparateDirectories(cacheDirectory: string, libraryDirectory: string): void {
  const cache = resolve(cacheDirectory)
  const library = resolve(libraryDirectory)
  if (pathContains(cache, library) || pathContains(library, cache))
    throw new TypeError('Shelf reading cache and library directories must not overlap')
}

function publicFile(located: LocatedStoredDocument): ShelfReadingFile {
  return {
    document: {
      book: structuredClone(located.document.book),
      byteLength: located.document.byteLength,
      format: located.document.format,
      name: located.document.name,
    },
    location: located.location,
  }
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

/** Owns admission, recovery, cache retention, and file handles for Shelf readings. */
export class ShelfReadingFileStore {
  readonly #cache: ReadingDirectory
  readonly #library: ReadingDirectory
  readonly #maximumCacheBytes: number
  readonly #operations = createOperationSupervisor(
    'Shelf reading file store',
    { closedError: () => new Error('Shelf reading file store is closed') },
  )

  private constructor(
    cache: ReadingDirectory,
    library: ReadingDirectory,
    maximumCacheBytes: number,
  ) {
    this.#cache = cache
    this.#library = library
    this.#maximumCacheBytes = maximumCacheBytes
  }

  static async open(options: ShelfReadingFileStoreOptions): Promise<ShelfReadingFileStore> {
    assertNonEmpty(options.cacheDirectory, 'Shelf reading cache directory')
    assertNonEmpty(options.libraryDirectory, 'Shelf reading library directory')
    assertSeparateDirectories(options.cacheDirectory, options.libraryDirectory)
    const maximumCacheBytes = options.maximumCacheBytes ?? defaultMaximumBookCacheBytes
    if (!Number.isSafeInteger(maximumCacheBytes) || maximumCacheBytes < 1)
      throw new RangeError('Shelf reading cache maximum size must be a positive safe integer')

    const [cache, library] = await Promise.all([
      ReadingDirectory.open(options.cacheDirectory),
      ReadingDirectory.open(options.libraryDirectory),
    ])
    await cache.pruneCache(maximumCacheBytes)
    return new ShelfReadingFileStore(cache, library, maximumCacheBytes)
  }

  #run<Result>(operation: () => Promise<Result>): Promise<Result> {
    return this.#operations.run(operation)
  }

  async #findCached(readingId: string): Promise<StoredReadingDocument | null> {
    try {
      return await this.#cache.find(readingId)
    }
    catch (error) {
      if (!(error instanceof InvalidShelfReadingDocumentError))
        throw error
      try {
        await this.#cache.remove(readingId)
      }
      catch (cleanupError) {
        throw combineLifecycleFailures(
          [error, cleanupError],
          `Invalid Shelf cache cleanup failed for ${readingId}`,
        )
      }
      return null
    }
  }

  async #findStored(readingId: string): Promise<LocatedStoredDocument | null> {
    const libraryDocument = await this.#library.find(readingId)
    if (libraryDocument)
      return { document: libraryDocument, location: 'library' }
    const cachedDocument = await this.#findCached(readingId)
    return cachedDocument ? { document: cachedDocument, location: 'cache' } : null
  }

  async #promote(readingId: string): Promise<LocatedStoredDocument | null> {
    const libraryDocument = await this.#library.find(readingId)
    if (libraryDocument) {
      await this.#cache.remove(readingId)
      return { document: libraryDocument, location: 'library' }
    }
    const cachedDocument = await this.#findCached(readingId)
    if (cachedDocument === null)
      return null
    const published = await this.#library.publishCopy(readingId, cachedDocument)
    await this.#cache.remove(readingId)
    return { document: published, location: 'library' }
  }

  close(): Promise<void> {
    return this.#operations.close()
  }

  async deleteFromLibrary(readingId: string): Promise<boolean> {
    assertReadingId(readingId)
    return this.#run(async () => {
      if (await this.#library.find(readingId) === null)
        return false
      await this.#library.remove(readingId)
      return true
    })
  }

  async find(readingId: string): Promise<ShelfReadingFile | null> {
    assertReadingId(readingId)
    return this.#run(async () => {
      const located = await this.#findStored(readingId)
      return located ? publicFile(located) : null
    })
  }

  async retainInLibrary(readingId: string): Promise<ShelfReadingFile | null> {
    assertReadingId(readingId)
    return this.#run(async () => {
      const promoted = await this.#promote(readingId)
      return promoted ? publicFile(promoted) : null
    })
  }

  async readRange(input: ShelfReadingRangeInput): Promise<Uint8Array> {
    assertReadingId(input.readingId)
    assertNonNegativeSafeInteger(input.offset, 'Shelf reading range offset')
    assertNonNegativeSafeInteger(input.length, 'Shelf reading range length')
    return this.#run(async () => {
      const located = await this.#findStored(input.readingId)
      if (located === null)
        throw new Error(`Shelf reading file is missing: ${input.readingId}`)
      if (located.location === 'cache')
        await this.#cache.touch(located.document)
      return readStoredReadingRange(located.document, input)
    })
  }

  async save(input: SaveShelfReadingFileInput): Promise<ShelfReadingFile> {
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

    return this.#run(async () => {
      const libraryDocument = await this.#library.find(input.readingId)
      if (libraryDocument) {
        await this.#cache.remove(input.readingId)
        return publicFile({ document: libraryDocument, location: 'library' })
      }
      if (input.retention === 'library') {
        const promoted = await this.#promote(input.readingId)
        if (promoted)
          return publicFile(promoted)
      }

      const directory = input.retention === 'cache' ? this.#cache : this.#library
      const existing = await directory.find(input.readingId)
      if (existing) {
        if (input.retention === 'cache') {
          await this.#cache.touch(existing)
          await this.#cache.pruneCache(this.#maximumCacheBytes, input.readingId)
        }
        return publicFile({ document: existing, location: input.retention })
      }

      const name = sanitizedFileName(input.name, input.format)
      const book = createBookBinding(input, name)
      const published = await directory.publishBytes(input.readingId, book, name, input.bytes)
      if (input.retention === 'cache')
        await this.#cache.pruneCache(this.#maximumCacheBytes, input.readingId)
      return publicFile({ document: published, location: input.retention })
    })
  }
}
