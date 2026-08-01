import type {
  AddShelfSourceInput,
  BrowseShelfInput,
  ShelfAssetInput,
  ShelfBrowseGroup,
  ShelfBrowseIssue,
  ShelfBrowseResult,
  ShelfImageCache,
  ShelfPublicationDetails,
  ShelfPublicationDetailsInput,
  ShelfRequestCredentials,
  ShelfSource,
  ShelfStorage,
  StoredShelfSource,
  UpdateShelfSourceInput,
} from '@memorilo/shelf'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import {
  fetchShelfAsset,
  fetchShelfPage,
  ShelfAuthenticationError,
  ShelfNetworkError,
  ShelfParseError,
  ShelfResponseError,
} from '@memorilo/shelf'
import { Effect } from 'effect'
import { safeStorage } from 'electron'
import { IpcMethod, IpcService } from 'electron-ipc-decorator'

const maximumConcurrentShelfAssetRequests = 3

function createConcurrencyLimiter(maximumConcurrent: number) {
  if (!Number.isInteger(maximumConcurrent) || maximumConcurrent < 1)
    throw new RangeError('Maximum concurrency must be a positive integer')

  let active = 0
  const waiting: Array<() => void> = []

  const acquire = async () => {
    if (active < maximumConcurrent) {
      active += 1
      return
    }
    await new Promise<void>(resolve => waiting.push(resolve))
  }

  const release = () => {
    const next = waiting.shift()
    if (next) {
      next()
      return
    }
    active -= 1
    if (active < 0)
      throw new Error('Shelf request limiter released more requests than it acquired')
  }

  return async <Result>(operation: () => Promise<Result>): Promise<Result> => {
    await acquire()
    try {
      return await operation()
    }
    finally {
      release()
    }
  }
}

function publicSource(source: StoredShelfSource): ShelfSource {
  const { encryptedPassword: _encryptedPassword, fieldClocks: _fieldClocks, ...value } = source
  return value
}

function normalizedSourceUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new TypeError('Book source URL must use HTTP or HTTPS')
  return url.href
}

function normalizedOptionalInput(value: string | undefined): string | undefined {
  if (value === undefined)
    return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? undefined : normalized
}

function credentialsFromInput(input: AddShelfSourceInput): ShelfRequestCredentials | undefined {
  const username = normalizedOptionalInput(input.username)
  const password = normalizedOptionalInput(input.password)
  if ((username === undefined) !== (password === undefined))
    throw new TypeError('Username and password must be provided together')
  return username === undefined || password === undefined ? undefined : { password, username }
}

function encryptPassword(password: string | undefined): Uint8Array | null {
  if (password === undefined)
    return null
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Secure credential storage is unavailable on this device')
  return new Uint8Array(safeStorage.encryptString(password))
}

function credentialsFromSource(source: StoredShelfSource): ShelfRequestCredentials | undefined {
  if (source.auth === 'none')
    return undefined
  if (source.username === null || source.encryptedPassword === null)
    throw new Error(`Shelf source ${source.id} is missing its saved credentials`)
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Secure credential storage is unavailable on this device')
  return {
    password: safeStorage.decryptString(Buffer.from(source.encryptedPassword)),
    username: source.username,
  }
}

function requestIssue(error: unknown): ShelfBrowseIssue {
  if (error instanceof ShelfAuthenticationError)
    return { kind: 'authentication', message: error.message }
  if (error instanceof ShelfParseError)
    return { kind: 'parse', message: error.message }
  if (error instanceof ShelfResponseError)
    return { kind: 'response', message: error.message }
  if (error instanceof ShelfNetworkError)
    return { kind: 'network', message: 'Couldn’t reach this book source. Showing saved books.' }
  return {
    kind: 'network',
    message: error instanceof Error ? error.message : 'The book source could not be refreshed.',
  }
}

function selectSources(sources: readonly StoredShelfSource[], sourceId: string | undefined): readonly StoredShelfSource[] {
  const enabled = sources.filter(source => source.enabled)
  if (sourceId === undefined)
    return enabled
  const selected = sources.find(source => source.id === sourceId)
  if (!selected)
    throw new Error(`Unknown Shelf source: ${sourceId}`)
  return [selected]
}

function sourcePageUrl(source: StoredShelfSource, input: BrowseShelfInput): string {
  if (input.pageUrl === undefined)
    return source.url
  if (input.sourceId !== source.id)
    throw new TypeError('A Shelf page URL can only be used with one selected source')
  return normalizedSourceUrl(input.pageUrl)
}

async function cachedGroup(
  storage: ShelfStorage,
  source: StoredShelfSource,
  input: BrowseShelfInput,
  issue: ShelfBrowseIssue | null = null,
): Promise<ShelfBrowseGroup> {
  const cached = await storage.getCachedPage(source.id, sourcePageUrl(source, input))
  return {
    issue,
    page: cached?.page ?? null,
    source: publicSource(source),
  }
}

async function refreshGroup(
  storage: ShelfStorage,
  source: StoredShelfSource,
  input: BrowseShelfInput,
): Promise<ShelfBrowseGroup> {
  const url = sourcePageUrl(source, input)
  const cached = await storage.getCachedPage(source.id, url)
  try {
    const credentials = credentialsFromSource(source)
    const result = await Effect.runPromise(fetchShelfPage({
      ...(cached?.etag ? { etag: cached.etag } : {}),
      ...(cached?.lastModified ? { lastModified: cached.lastModified } : {}),
      ...(credentials ? { credentials } : {}),
      url,
    }))
    if (result.status === 'not-modified') {
      if (!cached)
        throw new Error(`Shelf source ${source.id} returned not-modified without a cached page`)
      await storage.savePage({ ...cached, fetchedAt: result.fetchedAt })
      return { issue: null, page: cached.page, source: publicSource(source) }
    }
    await storage.savePage({
      etag: result.etag,
      fetchedAt: result.fetchedAt,
      lastModified: result.lastModified,
      page: result.page,
      sourceId: source.id,
      url,
    })
    return { issue: null, page: result.page, source: publicSource(source) }
  }
  catch (error) {
    return cachedGroup(storage, source, input, requestIssue(error))
  }
}

export function createShelfService(storage: ShelfStorage, imageCache: ShelfImageCache) {
  const limitAssetRequest = createConcurrencyLimiter(maximumConcurrentShelfAssetRequests)

  class ShelfService extends IpcService {
    static override readonly groupName = 'shelf'

    @IpcMethod()
    async addSource(input: AddShelfSourceInput): Promise<ShelfSource> {
      const url = normalizedSourceUrl(input.url)
      const credentials = credentialsFromInput(input)
      const encryptedPassword = encryptPassword(credentials?.password)
      const result = await Effect.runPromise(fetchShelfPage({
        ...(credentials ? { credentials } : {}),
        url,
      }))
      if (result.status === 'not-modified')
        throw new Error('A new Shelf source cannot return not-modified')
      const now = Date.now()
      const id = randomUUID()
      const source: ShelfSource = {
        addedAt: now,
        auth: credentials ? 'basic' : 'none',
        enabled: true,
        id,
        kind: 'opds',
        name: normalizedOptionalInput(input.name) ?? result.page.title,
        orderKey: `${now.toString().padStart(13, '0')}:${id}`,
        updatedAt: now,
        url,
        username: credentials?.username ?? null,
      }
      await storage.saveSource({
        encryptedPassword,
        source,
      })
      await storage.savePage({
        etag: result.etag,
        fetchedAt: result.fetchedAt,
        lastModified: result.lastModified,
        page: result.page,
        sourceId: source.id,
        url,
      })
      return source
    }

    @IpcMethod()
    async getAsset(input: ShelfAssetInput) {
      const source = await storage.getSource(input.sourceId)
      if (!source)
        throw new Error(`Unknown Shelf source: ${input.sourceId}`)
      const url = normalizedSourceUrl(input.url)
      const cached = await imageCache.get(source.id, url)
      if (cached)
        return { bytes: cached.bytes, mimeType: cached.mimeType }
      const credentials = credentialsFromSource(source)
      const result = await limitAssetRequest(() => Effect.runPromise(fetchShelfAsset({
        ...(credentials ? { credentials } : {}),
        url,
      })))
      if (result.status === 'not-modified')
        throw new Error(`Shelf asset ${url} returned not-modified without cached bytes`)
      await imageCache.save({
        bytes: result.bytes,
        etag: result.etag,
        fetchedAt: result.fetchedAt,
        lastModified: result.lastModified,
        mimeType: result.mimeType,
        sourceId: source.id,
        url,
      })
      return { bytes: result.bytes, mimeType: result.mimeType }
    }

    @IpcMethod()
    async getCachedView(input: BrowseShelfInput): Promise<ShelfBrowseResult> {
      const sources = selectSources(await storage.listSources(), input.sourceId)
      return {
        groups: await Promise.all(sources.map(source => cachedGroup(storage, source, input))),
        refreshedAt: null,
      }
    }

    @IpcMethod()
    async getPublicationDetails(input: ShelfPublicationDetailsInput): Promise<ShelfPublicationDetails> {
      const source = await storage.getSource(input.sourceId)
      if (!source)
        throw new Error(`Unknown Shelf source: ${input.sourceId}`)
      const publication = await storage.getCachedPublication(source.id, input.publicationId)
      if (!publication)
        throw new Error('This book is no longer available in the saved Shelf catalog.')
      return {
        publication,
        source: publicSource(source),
      }
    }

    @IpcMethod()
    async listSources(): Promise<readonly ShelfSource[]> {
      return (await storage.listSources()).map(publicSource)
    }

    @IpcMethod()
    async updateSource(input: UpdateShelfSourceInput): Promise<ShelfSource> {
      const current = await storage.getSource(input.id)
      if (!current)
        throw new Error(`Unknown Shelf source: ${input.id}`)

      const url = normalizedSourceUrl(input.url)
      const name = normalizedOptionalInput(input.name)
      if (name === undefined)
        throw new TypeError('Book source name is required')

      const requestedUsername = normalizedOptionalInput(input.username)
      const requestedPassword = normalizedOptionalInput(input.password)
      const preservedCredentials = input.clearCredentials ? undefined : credentialsFromSource(current)
      const username = input.clearCredentials ? undefined : requestedUsername ?? preservedCredentials?.username
      const password = input.clearCredentials ? undefined : requestedPassword ?? preservedCredentials?.password
      if ((username === undefined) !== (password === undefined))
        throw new TypeError('Username and password must be provided together')
      const credentials = username === undefined || password === undefined ? undefined : { password, username }
      const result = await Effect.runPromise(fetchShelfPage({
        ...(credentials ? { credentials } : {}),
        url,
      }))
      if (result.status === 'not-modified')
        throw new Error('An updated Shelf source cannot return not-modified')

      const source: ShelfSource = {
        ...publicSource(current),
        auth: credentials ? 'basic' : 'none',
        name,
        updatedAt: Date.now(),
        url,
        username: credentials?.username ?? null,
      }
      await storage.saveSource({
        encryptedPassword: credentials
          ? requestedPassword === undefined ? current.encryptedPassword : encryptPassword(requestedPassword)
          : null,
        source,
      })
      await storage.savePage({
        etag: result.etag,
        fetchedAt: result.fetchedAt,
        lastModified: result.lastModified,
        page: result.page,
        sourceId: source.id,
        url,
      })
      return source
    }

    @IpcMethod()
    async removeSource(sourceId: string): Promise<void> {
      await imageCache.deleteSource(sourceId)
      await storage.deleteSource(sourceId)
    }

    @IpcMethod()
    async refreshView(input: BrowseShelfInput): Promise<ShelfBrowseResult> {
      const sources = selectSources(await storage.listSources(), input.sourceId)
      const groups = await Promise.all(sources.map(source => refreshGroup(storage, source, input)))
      return {
        groups,
        refreshedAt: groups.some(group => group.issue === null) ? Date.now() : null,
      }
    }
  }

  return ShelfService
}
