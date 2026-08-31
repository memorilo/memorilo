import type { SyncObjectMetadata, SyncObjectStore } from '@memorilo/sync'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { link, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { objectKeyFor } from '@memorilo/sync'

type StoredMetadata = Omit<SyncObjectMetadata, 'createdAt'> & { readonly createdAt: number }

export interface FilesystemObjectStoreOptions {
  readonly root: string
}

function metadataPath(objectPath: string): string {
  return `${objectPath}.meta.json`
}

function ensureWithinRoot(root: string, key: string): string {
  if (isAbsolute(key))
    throw new TypeError('Object key must be relative')
  const rootPath = resolve(root)
  const objectPath = resolve(rootPath, key)
  const relativePath = relative(rootPath, objectPath)
  if (relativePath.startsWith('..') || isAbsolute(relativePath))
    throw new TypeError('Object key escapes object-store root')
  return objectPath
}

function ensureAccountKey(accountId: string, key: string): void {
  if (!accountId || !key.startsWith(`tenants/${accountId}/`))
    throw new Error('Object key does not belong to the requested account')
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path))
    hash.update(chunk)
  return hash.digest('hex')
}

function sameMetadata(left: SyncObjectMetadata, right: SyncObjectMetadata): boolean {
  return left.accountId === right.accountId
    && left.generation === right.generation
    && left.key === right.key
    && left.contentHash === right.contentHash
    && left.contentLength === right.contentLength
    && left.contentType === right.contentType
}

function assertMetadata(metadata: SyncObjectMetadata): void {
  const expectedKey = objectKeyFor(metadata.accountId, metadata.generation, metadata.contentHash)
  if (metadata.namespace !== 'assets' || metadata.key !== expectedKey)
    throw new TypeError('Object metadata does not match its content-addressed key')
  if (!Number.isSafeInteger(metadata.contentLength) || metadata.contentLength < 0)
    throw new TypeError('Object content length must be a non-negative safe integer')
}

export function createFilesystemObjectStore(options: FilesystemObjectStoreOptions): SyncObjectStore {
  const root = resolve(options.root)

  return {
    close: () => undefined,
    verify: async () => {
      await mkdir(root, { recursive: true })
      const probe = join(root, `.memorilo-write-probe-${randomUUID()}`)
      try {
        await writeFile(probe, 'memorilo', { flag: 'wx', mode: 0o600 })
        if (await readFile(probe, 'utf8') !== 'memorilo')
          throw new Error('Filesystem object-store probe could not be read back')
      }
      finally {
        await rm(probe, { force: true })
      }
    },
    delete: async (accountId, key) => {
      ensureAccountKey(accountId, key)
      const objectPath = ensureWithinRoot(root, key)
      await Promise.all([
        rm(objectPath, { force: true }),
        rm(metadataPath(objectPath), { force: true }),
      ])
    },
    get: async (accountId, key) => {
      ensureAccountKey(accountId, key)
      const objectPath = ensureWithinRoot(root, key)
      try {
        const [rawMetadata, objectStat] = await Promise.all([
          readFile(metadataPath(objectPath), 'utf8'),
          stat(objectPath),
        ])
        const metadata = JSON.parse(rawMetadata) as StoredMetadata
        if (metadata.accountId !== accountId || metadata.key !== key || objectStat.size !== metadata.contentLength)
          throw new Error('Object metadata does not match requested object')
        return {
          body: (async function* () {
            for await (const chunk of createReadStream(objectPath))
              yield chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
          })(),
          metadata,
        }
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return null
        throw error
      }
    },
    head: async (accountId, key) => {
      ensureAccountKey(accountId, key)
      const objectPath = ensureWithinRoot(root, key)
      try {
        const [rawMetadata, objectStat] = await Promise.all([
          readFile(metadataPath(objectPath), 'utf8'),
          stat(objectPath),
        ])
        const metadata = JSON.parse(rawMetadata) as StoredMetadata
        if (metadata.accountId !== accountId || metadata.key !== key || objectStat.size !== metadata.contentLength)
          return null
        return metadata
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return null
        throw error
      }
    },
    list: async (accountId, cursor = '', limit = 100) => {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000)
        throw new RangeError('Object list limit must be between 1 and 1000')
      const accountRoot = ensureWithinRoot(root, `tenants/${accountId}`)
      let entries: string[]
      try {
        entries = await readdir(accountRoot, { recursive: true })
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return { cursor: null, items: [] }
        throw error
      }
      const metadataFiles = entries
        .filter(entry => entry.endsWith('.meta.json'))
        .map(entry => join(accountRoot, entry))
        .sort()
      const items: SyncObjectMetadata[] = []
      for (const path of metadataFiles) {
        const metadata = JSON.parse(await readFile(path, 'utf8')) as StoredMetadata
        if (metadata.key <= cursor)
          continue
        items.push(metadata)
        if (items.length === limit)
          break
      }
      const nextCursor = items.length === limit ? items.at(-1)?.key ?? null : null
      return { cursor: nextCursor, items }
    },
    putImmutable: async (metadata, body) => {
      assertMetadata(metadata)
      const objectPath = ensureWithinRoot(root, metadata.key)
      const metadataFile = metadataPath(objectPath)
      const temporarySuffix = `${process.pid}-${Date.now()}-${randomUUID()}`
      const temporaryPath = `${objectPath}.tmp-${temporarySuffix}`
      const temporaryMetadataPath = `${metadataFile}.tmp-${temporarySuffix}`
      await mkdir(dirname(objectPath), { recursive: true })
      try {
        const existing = await (async () => {
          try {
            return JSON.parse(await readFile(metadataFile, 'utf8')) as StoredMetadata
          }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
              return null
            throw error
          }
        })()
        if (existing) {
          if (!sameMetadata(existing, metadata))
            throw new Error('Object key already contains different metadata')
          return
        }
        const hash = createHash('sha256')
        const verifiedBody = (async function* () {
          for await (const chunk of body) {
            hash.update(chunk)
            yield chunk
          }
        })()
        await pipeline(verifiedBody, createWriteStream(temporaryPath, { flags: 'wx' }))
        const objectStat = await stat(temporaryPath)
        if (objectStat.size !== metadata.contentLength)
          throw new Error(`Object length mismatch: expected ${metadata.contentLength}, received ${objectStat.size}`)
        if (hash.digest('hex') !== metadata.contentHash)
          throw new Error('Object content hash does not match its manifest')
        await writeFile(temporaryMetadataPath, JSON.stringify(metadata), { flag: 'wx' })
        try {
          await link(temporaryPath, objectPath)
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
            throw error
          const existingStat = await stat(objectPath)
          if (existingStat.size !== metadata.contentLength || await hashFile(objectPath) !== metadata.contentHash)
            throw new Error('Object key already contains different bytes')
        }
        try {
          await link(temporaryMetadataPath, metadataFile)
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
            throw error
          const existingMetadata = JSON.parse(await readFile(metadataFile, 'utf8')) as StoredMetadata
          if (!sameMetadata(existingMetadata, metadata))
            throw new Error('Object key already contains different metadata')
        }
      }
      finally {
        await Promise.all([
          rm(temporaryPath, { force: true }),
          rm(temporaryMetadataPath, { force: true }),
        ])
      }
    },
  }
}
