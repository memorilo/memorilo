import type { BookFileBinding } from '@memorilo/reading-model'
import type { Stats } from 'node:fs'
import type { ShelfReadingFormat, ShelfReadingRangeInput } from '../model'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, open, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { combineLifecycleFailures } from '@memorilo/effect-lifecycle'
import { assertBookFileBinding, readingFormatFromFileName } from '@memorilo/reading-model'
import { Effect } from 'effect'

const backupSuffix = '.backup'
const manifestFileName = 'manifest.json'
const manifestSchemaVersion = 1
const partSuffix = '.part'
const readingIdPattern = /^[a-f0-9]{64}$/u

interface StoredReadingManifest {
  book: BookFileBinding
  fileName: string
  schemaVersion: number
}

interface ValidatedFile {
  byteLength: number
  mtimeMs: number
  sha256: string
}

export interface StoredReadingDocument {
  book: BookFileBinding
  byteLength: number
  format: ShelfReadingFormat
  lastAccessedAt: number
  name: string
  path: string
}

export class InvalidShelfReadingDocumentError extends Error {
  constructor(
    readonly directory: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`${message}: ${directory}`, options)
    this.name = 'InvalidShelfReadingDocumentError'
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch (error) {
    if (isNotFound(error))
      return false
    throw error
  }
}

async function recoverReadingDirectory(destination: string): Promise<void> {
  const backup = `${destination}${backupSuffix}`
  if (!await pathExists(backup))
    return
  if (await pathExists(destination)) {
    await rm(backup, { force: true, recursive: true })
    return
  }
  await rename(backup, destination)
}

async function recoverReadingDirectoryRoot(root: string): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory())
      continue
    if (entry.name.endsWith(partSuffix)) {
      await rm(join(root, entry.name), { force: true, recursive: true })
      continue
    }
    if (entry.name.endsWith(backupSuffix)) {
      await recoverReadingDirectory(
        join(root, entry.name.slice(0, -backupSuffix.length)),
      )
    }
  }
}

async function replaceReadingDirectory(
  destination: string,
  write: (temporaryDirectory: string) => Promise<void>,
): Promise<void> {
  await recoverReadingDirectory(destination)
  const backup = `${destination}${backupSuffix}`
  const temporaryDirectory = join(
    dirname(destination),
    `${basename(destination)}.${randomUUID()}${partSuffix}`,
  )
  await mkdir(temporaryDirectory, { recursive: false })
  let destinationMoved = false
  let published = false

  try {
    await write(temporaryDirectory)
    if (await pathExists(destination)) {
      await rename(destination, backup)
      destinationMoved = true
    }
    await rename(temporaryDirectory, destination)
    published = true
    if (destinationMoved)
      await rm(backup, { force: true, recursive: true })
  }
  catch (operationError) {
    const failures: unknown[] = [operationError]
    if (!published && destinationMoved && !await pathExists(destination)) {
      try {
        await rename(backup, destination)
      }
      catch (rollbackError) {
        failures.push(rollbackError)
      }
    }
    try {
      await rm(temporaryDirectory, { force: true, recursive: true })
    }
    catch (cleanupError) {
      failures.push(cleanupError)
    }
    throw combineLifecycleFailures(
      failures,
      `Shelf reading directory transaction failed for ${destination}`,
    )
  }
}

function invalidDocument(directory: string, message: string, cause?: unknown): InvalidShelfReadingDocumentError {
  return new InvalidShelfReadingDocumentError(
    directory,
    message,
    cause === undefined ? undefined : { cause },
  )
}

async function storedDocument(directory: string): Promise<StoredReadingDocument | null> {
  await recoverReadingDirectory(directory)
  let manifestText: string
  try {
    manifestText = await readFile(join(directory, manifestFileName), 'utf8')
  }
  catch (error) {
    if (isNotFound(error))
      return null
    throw error
  }

  let value: unknown
  try {
    value = JSON.parse(manifestText)
  }
  catch (error) {
    throw invalidDocument(directory, 'Shelf reading manifest is not valid JSON', error)
  }
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw invalidDocument(directory, 'Shelf reading manifest must be an object')
  const manifest = value as Partial<StoredReadingManifest>
  if (manifest.schemaVersion !== manifestSchemaVersion)
    throw invalidDocument(directory, 'Shelf reading manifest has an unsupported version')
  if (typeof manifest.fileName !== 'string' || basename(manifest.fileName) !== manifest.fileName)
    throw invalidDocument(directory, 'Shelf reading manifest has an invalid file name')
  try {
    assertBookFileBinding(manifest.book, `Shelf reading manifest ${directory}`, {
      requireRetrievalHint: true,
      requireShelfRetrievalHint: true,
    })
  }
  catch (error) {
    throw invalidDocument(directory, 'Shelf reading manifest has an invalid book binding', error)
  }
  const format = readingFormatFromFileName(manifest.fileName)
  if (format === null || format !== manifest.book.file.format)
    throw invalidDocument(directory, 'Shelf reading manifest format does not match its file name')
  const path = join(directory, manifest.fileName)
  let file: Stats
  try {
    file = await stat(path)
  }
  catch (error) {
    if (isNotFound(error))
      throw invalidDocument(directory, 'Shelf reading manifest references a missing file', error)
    throw error
  }
  if (!file.isFile())
    throw invalidDocument(directory, 'Shelf reading manifest does not reference a file')
  if (file.size !== manifest.book.file.byteLength)
    throw invalidDocument(directory, 'Shelf reading file length does not match its manifest')
  return {
    book: structuredClone(manifest.book),
    byteLength: file.size,
    format,
    lastAccessedAt: file.mtimeMs,
    name: manifest.fileName,
    path,
  }
}

function storedManifest(book: BookFileBinding, fileName: string): StoredReadingManifest {
  return {
    book: structuredClone(book),
    fileName,
    schemaVersion: manifestSchemaVersion,
  }
}

function assertPublishInput(book: BookFileBinding, fileName: string): void {
  assertBookFileBinding(book, 'Shelf reading binding', {
    requireRetrievalHint: true,
    requireShelfRetrievalHint: true,
  })
  if (basename(fileName) !== fileName)
    throw new TypeError('Shelf reading file name must not contain a directory')
  if (readingFormatFromFileName(fileName) !== book.file.format)
    throw new TypeError('Shelf reading file name must match its binding format')
}

async function writeManifest(directory: string, book: BookFileBinding, fileName: string): Promise<void> {
  await writeFile(
    join(directory, manifestFileName),
    JSON.stringify(storedManifest(book, fileName)),
    { encoding: 'utf8', flag: 'wx' },
  )
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  try {
    for await (const chunk of stream)
      hash.update(chunk)
    return hash.digest('hex')
  }
  finally {
    stream.destroy()
  }
}

export class ReadingDirectory {
  readonly #validated = new Map<string, ValidatedFile>()

  private constructor(private readonly path: string) {}

  static async open(path: string): Promise<ReadingDirectory> {
    await mkdir(path, { recursive: true })
    await recoverReadingDirectoryRoot(path)
    return new ReadingDirectory(path)
  }

  async find(readingId: string): Promise<StoredReadingDocument | null> {
    const directory = join(this.path, readingId)
    const document = await storedDocument(directory)
    if (document === null)
      return null

    const previous = this.#validated.get(readingId)
    if (previous?.byteLength === document.byteLength
      && previous.mtimeMs === document.lastAccessedAt
      && previous.sha256 === document.book.file.sha256) {
      return document
    }

    const sha256 = await sha256File(document.path)
    if (sha256 !== document.book.file.sha256) {
      this.#validated.delete(readingId)
      throw invalidDocument(directory, 'Shelf reading file content does not match its manifest')
    }
    this.#validated.set(readingId, {
      byteLength: document.byteLength,
      mtimeMs: document.lastAccessedAt,
      sha256,
    })
    return document
  }

  async remove(readingId: string): Promise<void> {
    this.#validated.delete(readingId)
    await rm(join(this.path, readingId), { force: true, recursive: true })
  }

  async touch(document: StoredReadingDocument): Promise<void> {
    const now = new Date()
    await utimes(document.path, now, now)
  }

  async publishBytes(
    readingId: string,
    book: BookFileBinding,
    fileName: string,
    bytes: Uint8Array,
  ): Promise<StoredReadingDocument> {
    assertPublishInput(book, fileName)
    if (bytes.byteLength !== book.file.byteLength)
      throw new RangeError('Shelf reading bytes do not match their binding length')
    return this.#publish(readingId, book, fileName, async (temporaryDirectory) => {
      await writeFile(join(temporaryDirectory, fileName), bytes, { flag: 'wx' })
    })
  }

  async publishCopy(
    readingId: string,
    document: StoredReadingDocument,
  ): Promise<StoredReadingDocument> {
    assertPublishInput(document.book, document.name)
    return this.#publish(readingId, document.book, document.name, async (temporaryDirectory) => {
      await copyFile(document.path, join(temporaryDirectory, document.name))
    })
  }

  async #publish(
    readingId: string,
    book: BookFileBinding,
    fileName: string,
    writeContent: (temporaryDirectory: string) => Promise<void>,
  ): Promise<StoredReadingDocument> {
    await replaceReadingDirectory(join(this.path, readingId), async (temporaryDirectory) => {
      await writeContent(temporaryDirectory)
      await writeManifest(temporaryDirectory, book, fileName)
    })
    const published = await this.find(readingId)
    if (published === null)
      throw new Error(`Published Shelf reading file is unavailable: ${readingId}`)
    return published
  }

  async pruneCache(maximumBytes: number, preservedReadingId?: string): Promise<void> {
    const entries = await readdir(this.path, { withFileTypes: true })
    const documents: Array<StoredReadingDocument & { readingId: string }> = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !readingIdPattern.test(entry.name))
        continue
      let document: StoredReadingDocument | null
      try {
        document = await this.find(entry.name)
      }
      catch (error) {
        if (!(error instanceof InvalidShelfReadingDocumentError))
          throw error
        try {
          await this.remove(entry.name)
        }
        catch (cleanupError) {
          throw combineLifecycleFailures(
            [error, cleanupError],
            `Invalid Shelf cache cleanup failed for ${entry.name}`,
          )
        }
        continue
      }
      if (document === null) {
        await this.remove(entry.name)
        continue
      }
      documents.push({ ...document, readingId: entry.name })
    }

    let totalBytes = documents.reduce((total, document) => total + document.byteLength, 0)
    const oldestFirst = [...documents].sort((left, right) => (
      left.lastAccessedAt - right.lastAccessedAt || left.readingId.localeCompare(right.readingId)
    ))
    for (const document of oldestFirst) {
      if (totalBytes <= maximumBytes)
        break
      if (document.readingId === preservedReadingId)
        continue
      await this.remove(document.readingId)
      totalBytes -= document.byteLength
    }
  }
}

export function readStoredReadingRange(
  document: StoredReadingDocument,
  input: ShelfReadingRangeInput,
): Promise<Uint8Array> {
  return Effect.runPromise(Effect.acquireUseRelease(
    Effect.tryPromise({
      catch: error => error,
      try: () => open(document.path, 'r'),
    }),
    handle => Effect.tryPromise({
      catch: error => error,
      try: async () => {
        const byteLength = (await handle.stat()).size
        if (!Number.isSafeInteger(byteLength) || byteLength < 0)
          throw new RangeError('Shelf publication byte length exceeds the supported range')
        if (byteLength !== document.byteLength)
          throw new Error('Shelf reading file changed after its manifest was loaded')
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
      },
    }),
    handle => Effect.tryPromise({
      catch: error => error,
      try: () => handle.close(),
    }),
  ))
}
