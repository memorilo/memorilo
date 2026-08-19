import type {
  AddShelfSourceInput,
  BrowseShelfInput,
  CachedShelfPage,
  FetchShelfAssetInput,
  FetchShelfAssetResult,
  FetchShelfPageInput,
  FetchShelfPageResult,
  FetchShelfPublicationInput,
  FetchShelfPublicationResult,
  ShelfAssetInput,
  ShelfBrowseGroup,
  ShelfBrowseIssue,
  ShelfBrowseResult,
  ShelfImageCache,
  ShelfPublication,
  ShelfReadingFormat,
  ShelfRequestCredentials,
  ShelfRequestError,
  ShelfSource,
  ShelfStorage,
  StoredShelfSource,
  UpdateShelfSourceInput,
} from '@memorilo/shelf'
import type { Effect as EffectType } from 'effect'
import { shelfReadingAcquisitions } from '@memorilo/shelf'
import { Effect } from 'effect'

export interface ShelfCredentialAccess {
  clear: (sourceId: string) => Promise<void>
  encrypt: (password: string) => Promise<Uint8Array | null> | Uint8Array | null
  read: (source: StoredShelfSource) => Promise<ShelfRequestCredentials | undefined> | ShelfRequestCredentials | undefined
  save: (sourceId: string, credentials: ShelfRequestCredentials | undefined) => Promise<void>
}
export interface ShelfApplicationDependencies {
  credentials: ShelfCredentialAccess
  fetchAsset: (input: FetchShelfAssetInput) => EffectType.Effect<FetchShelfAssetResult, ShelfRequestError>
  fetchPage: (input: FetchShelfPageInput) => EffectType.Effect<FetchShelfPageResult, ShelfRequestError>
  fetchPublication: (input: FetchShelfPublicationInput) => EffectType.Effect<FetchShelfPublicationResult, ShelfRequestError>
  imageCache: Pick<ShelfImageCache, 'deleteSource' | 'get' | 'save'>
  now: () => number
  randomId: () => string
  storage: Pick<ShelfStorage, 'pages' | 'sources'>
}

function normalizeOptional(value: string | undefined): string | undefined {
  if (value === undefined)
    return undefined
  const normalized = value.trim()
  return normalized.length === 0 ? undefined : normalized
}

export function normalizeShelfSourceUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new TypeError('Book source URL must use HTTP or HTTPS')
  return url.href
}

export function toPublicShelfSource(source: StoredShelfSource): ShelfSource {
  const { encryptedPassword: _encryptedPassword, fieldClocks: _fieldClocks, ...value } = source
  return value
}

function credentialsFromInput(input: AddShelfSourceInput): ShelfRequestCredentials | undefined {
  const username = normalizeOptional(input.username)
  const password = normalizeOptional(input.password)
  if ((username === undefined) !== (password === undefined))
    throw new TypeError('Username and password must be provided together')
  return username === undefined || password === undefined ? undefined : { password, username }
}

async function runEffect<Result>(effect: EffectType.Effect<Result, unknown>): Promise<Result> {
  return Effect.runPromise(effect)
}

/** Owns Shelf source validation, credential persistence, and cache-safe removal. */
export class ShelfSourceApplication {
  constructor(private readonly dependencies: ShelfApplicationDependencies) {}

  async add(input: AddShelfSourceInput): Promise<ShelfSource> {
    const url = normalizeShelfSourceUrl(input.url)
    const credentials = credentialsFromInput(input)
    const result = await runEffect(this.dependencies.fetchPage({
      ...(credentials ? { credentials } : {}),
      url,
    }))
    if (result.status === 'not-modified')
      throw new Error('A new Shelf source cannot return not-modified')
    const now = this.dependencies.now()
    const source: ShelfSource = {
      addedAt: now,
      auth: credentials ? 'basic' : 'none',
      enabled: true,
      id: this.dependencies.randomId(),
      kind: 'opds',
      name: normalizeOptional(input.name) ?? result.page.title,
      orderKey: `${now.toString().padStart(13, '0')}:${this.dependencies.randomId()}`,
      updatedAt: now,
      url,
      username: credentials?.username ?? null,
    }
    const encryptedPassword = credentials
      ? await this.dependencies.credentials.encrypt(credentials.password)
      : null
    try {
      await this.dependencies.storage.sources.saveWithPage({
        encryptedPassword,
        page: {
          etag: result.etag,
          fetchedAt: result.fetchedAt,
          lastModified: result.lastModified,
          page: result.page,
          sourceId: source.id,
          url,
        },
        source,
      })
      await this.dependencies.credentials.save(source.id, credentials)
    }
    catch (error) {
      await this.dependencies.credentials.clear(source.id).catch(() => undefined)
      throw error
    }
    return source
  }

  async list(): Promise<readonly ShelfSource[]> {
    const sources = await this.dependencies.storage.sources.list()
    return sources.map(toPublicShelfSource)
  }

  async remove(sourceId: string): Promise<void> {
    await this.dependencies.imageCache.deleteSource(sourceId)
    await this.dependencies.storage.sources.delete(sourceId)
    await this.dependencies.credentials.clear(sourceId)
  }

  async update(input: UpdateShelfSourceInput): Promise<ShelfSource> {
    const current = await this.dependencies.storage.sources.get(input.id)
    if (!current)
      throw new Error(`Unknown Shelf source: ${input.id}`)
    const url = normalizeShelfSourceUrl(input.url)
    const name = normalizeOptional(input.name)
    if (!name)
      throw new TypeError('Book source name is required')
    const currentCredentials = input.clearCredentials
      ? undefined
      : await this.dependencies.credentials.read(current)
    const username = input.clearCredentials ? undefined : normalizeOptional(input.username) ?? currentCredentials?.username
    const password = input.clearCredentials ? undefined : normalizeOptional(input.password) ?? currentCredentials?.password
    if ((username === undefined) !== (password === undefined))
      throw new TypeError('Username and password must be provided together')
    const credentials = username === undefined || password === undefined ? undefined : { password, username }
    const encryptedPassword = credentials
      ? await this.dependencies.credentials.encrypt(credentials.password)
      : null
    const source: ShelfSource = {
      ...toPublicShelfSource(current),
      auth: credentials ? 'basic' : 'none',
      name,
      updatedAt: this.dependencies.now(),
      url,
      username: credentials?.username ?? null,
    }
    const result = await runEffect(this.dependencies.fetchPage({
      ...(credentials ? { credentials } : {}),
      url,
    }))
    if (result.status === 'not-modified')
      throw new Error('An updated Shelf source cannot return not-modified')
    await this.dependencies.storage.sources.saveWithPage({
      encryptedPassword,
      page: {
        etag: result.etag,
        fetchedAt: result.fetchedAt,
        lastModified: result.lastModified,
        page: result.page,
        sourceId: source.id,
        url,
      },
      source,
    })
    await this.dependencies.credentials.save(source.id, credentials)
    return source
  }
}

function requestIssue(error: ShelfRequestError): ShelfBrowseIssue {
  switch (error._tag) {
    case 'ShelfAuthenticationError':
      return { kind: 'authentication' }
    case 'ShelfNetworkError':
      return { kind: 'network' }
    case 'ShelfParseError':
      return { kind: 'parse' }
    case 'ShelfResponseError':
      return { kind: 'response', status: error.status }
  }
}

/** Owns cached OPDS browsing, conditional refresh, and cover caching. */
export class ShelfCatalogApplication {
  constructor(private readonly dependencies: ShelfApplicationDependencies) {}

  async cachedView(input: BrowseShelfInput): Promise<ShelfBrowseResult> {
    const sources = await this.selectSources(input.sourceId)
    const groups = await Promise.all(sources.map(source => this.cachedGroup(source, input)))
    return { groups, refreshedAt: null }
  }

  async refreshView(input: BrowseShelfInput): Promise<ShelfBrowseResult> {
    const sources = await this.selectSources(input.sourceId)
    const groups = await Promise.all(sources.map(source => this.refreshGroup(source, input)))
    return {
      groups,
      refreshedAt: groups.some(group => group.issue === null) ? this.dependencies.now() : null,
    }
  }

  async getAsset(input: ShelfAssetInput): Promise<{ bytes: Uint8Array, mimeType: string }> {
    const source = await this.requireSource(input.sourceId)
    const url = normalizeShelfSourceUrl(input.url)
    const cached = await this.dependencies.imageCache.get(source.id, url)
    if (cached)
      return { bytes: cached.bytes, mimeType: cached.mimeType }
    const credentials = await this.dependencies.credentials.read(source)
    const result = await runEffect(this.dependencies.fetchAsset({
      ...(credentials ? { credentials } : {}),
      url,
    }))
    if (result.status === 'not-modified')
      throw new Error(`Shelf asset ${url} returned not-modified without cached bytes`)
    await this.dependencies.imageCache.save({
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

  async downloadPublication(input: {
    format: ShelfReadingFormat
    publicationId: string
    sourceId: string
  }): Promise<{ bytes: Uint8Array, mimeType: string, publication: ShelfPublication, source: ShelfSource }> {
    const source = await this.requireSource(input.sourceId)
    const publication = await this.dependencies.storage.pages.getPublication(source.id, input.publicationId)
    if (!publication)
      throw new Error('This publication is no longer available in the saved Shelf catalog.')
    const acquisition = shelfReadingAcquisitions(publication)
      .find(candidate => candidate.format === input.format)
    if (!acquisition)
      throw new Error(`This publication does not provide a readable ${input.format.toLocaleUpperCase()} download.`)
    const credentials = await this.dependencies.credentials.read(source)
    const result = await runEffect(this.dependencies.fetchPublication({
      ...(credentials ? { credentials } : {}),
      format: input.format,
      url: acquisition.href,
    }))
    return { bytes: result.bytes, mimeType: result.mimeType, publication, source: toPublicShelfSource(source) }
  }

  private async selectSources(sourceId: string | undefined): Promise<readonly StoredShelfSource[]> {
    const sources = await this.dependencies.storage.sources.list()
    if (sourceId === undefined)
      return sources.filter(source => source.enabled)
    const selected = sources.find(source => source.id === sourceId)
    if (!selected)
      throw new Error(`Unknown Shelf source: ${sourceId}`)
    return [selected]
  }

  private async requireSource(sourceId: string): Promise<StoredShelfSource> {
    const source = await this.dependencies.storage.sources.get(sourceId)
    if (!source)
      throw new Error(`Unknown Shelf source: ${sourceId}`)
    return source
  }

  private async pageUrl(source: StoredShelfSource, input: BrowseShelfInput): Promise<string> {
    if (input.pageUrl === undefined)
      return source.url
    if (input.sourceId !== source.id)
      throw new TypeError('A Shelf page URL can only be used with one selected source')
    return normalizeShelfSourceUrl(input.pageUrl)
  }

  private async cachedGroup(source: StoredShelfSource, input: BrowseShelfInput, issue: ShelfBrowseIssue | null = null): Promise<ShelfBrowseGroup> {
    const url = await this.pageUrl(source, input)
    const cached = await this.dependencies.storage.pages.get(source.id, url)
    return { issue, page: cached?.page ?? null, source: toPublicShelfSource(source) }
  }

  private async refreshGroup(source: StoredShelfSource, input: BrowseShelfInput): Promise<ShelfBrowseGroup> {
    const url = await this.pageUrl(source, input)
    const cached = await this.dependencies.storage.pages.get(source.id, url)
    const credentials = await this.dependencies.credentials.read(source)
    let result: FetchShelfPageResult
    try {
      result = await runEffect(this.dependencies.fetchPage({
        ...(cached?.etag ? { etag: cached.etag } : {}),
        ...(cached?.lastModified ? { lastModified: cached.lastModified } : {}),
        ...(credentials ? { credentials } : {}),
        url,
      }))
    }
    catch (error) {
      if (error && typeof error === 'object' && '_tag' in error)
        return this.cachedGroup(source, input, requestIssue(error as ShelfRequestError))
      throw error
    }
    if (result.status === 'not-modified') {
      if (!cached)
        throw new Error(`Shelf source ${source.id} returned not-modified without a cached page`)
      const refreshed: CachedShelfPage = { ...cached, fetchedAt: result.fetchedAt }
      await this.dependencies.storage.pages.save(refreshed)
      return { issue: null, page: cached.page, source: toPublicShelfSource(source) }
    }
    await this.dependencies.storage.pages.save({
      etag: result.etag,
      fetchedAt: result.fetchedAt,
      lastModified: result.lastModified,
      page: result.page,
      sourceId: source.id,
      url,
    })
    return { issue: null, page: result.page, source: toPublicShelfSource(source) }
  }
}
