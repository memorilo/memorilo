import type {
  BrowseShelfInput,
  CachedShelfPage,
  FetchShelfAssetInput,
  FetchShelfAssetResult,
  FetchShelfPageInput,
  FetchShelfPageResult,
  ShelfAssetInput,
  ShelfBrowseGroup,
  ShelfBrowseIssue,
  ShelfBrowseResult,
  ShelfImageCache,
  ShelfRequestError,
  ShelfStorage,
  StoredShelfSource,
} from '@memorilo/shelf'
import type { Effect as EffectType } from 'effect'
import type { ShelfOperationRuntime } from './shelf-operation-runtime'
import type { ShelfCredentialAccess } from './shelf-source-model'
import { toError } from '@memorilo/effect-lifecycle'
import { Effect } from 'effect'
import { normalizeShelfSourceUrl, toPublicShelfSource } from './shelf-source-model'

interface ShelfCatalogBrowserDependencies {
  credentials: Pick<ShelfCredentialAccess, 'read'>
  fetchAsset: (input: FetchShelfAssetInput) => EffectType.Effect<FetchShelfAssetResult, ShelfRequestError>
  fetchPage: (input: FetchShelfPageInput) => EffectType.Effect<FetchShelfPageResult, ShelfRequestError>
  imageCache: Pick<ShelfImageCache, 'get' | 'save'>
  now: () => number
  operations: ShelfOperationRuntime
  storage: Pick<ShelfStorage, 'pages' | 'sources'>
}

function requestIssue(error: ShelfRequestError): ShelfBrowseIssue {
  switch (error._tag) {
    case 'ShelfAuthenticationError':
      return { kind: 'authentication' }
    case 'ShelfParseError':
      return { kind: 'parse' }
    case 'ShelfResponseError':
      return { kind: 'response', status: error.status }
    case 'ShelfNetworkError':
      return { kind: 'network' }
  }
}

/** Owns source selection, conditional refresh, and publication asset caching. */
export class ShelfCatalogBrowser {
  constructor(private readonly dependencies: ShelfCatalogBrowserDependencies) {}

  cachedView(input: BrowseShelfInput): Promise<ShelfBrowseResult> {
    return this.dependencies.operations.run(scope => Effect.gen({ self: this }, function* () {
      const storedSources = yield* this.#promise(() => this.dependencies.storage.sources.list())
      const sources = yield* this.#selectSources(storedSources, input.sourceId)
      return {
        groups: yield* scope.all(sources.map(source => scope.source(
          source.id,
          this.#cachedGroup(source, input),
        ))),
        refreshedAt: null,
      }
    }))
  }

  getAsset(input: ShelfAssetInput): Promise<{ bytes: Uint8Array, mimeType: string }> {
    return this.dependencies.operations.run(scope => scope.source(
      input.sourceId,
      scope.asset(Effect.gen({ self: this }, function* () {
        const source = yield* this.#requireSource(input.sourceId)
        const url = yield* Effect.try({ catch: toError, try: () => normalizeShelfSourceUrl(input.url) })
        const cached = yield* this.#promise(() => this.dependencies.imageCache.get(source.id, url))
        if (cached)
          return { bytes: cached.bytes, mimeType: cached.mimeType }
        const credentials = yield* Effect.try({
          catch: toError,
          try: () => this.dependencies.credentials.read(source),
        })
        const result = yield* this.dependencies.fetchAsset({
          ...(credentials ? { credentials } : {}),
          url,
        })
        if (result.status === 'not-modified')
          return yield* Effect.fail(new Error(`Shelf asset ${url} returned not-modified without cached bytes`))
        yield* this.#promise(() => this.dependencies.imageCache.save({
          bytes: result.bytes,
          etag: result.etag,
          fetchedAt: result.fetchedAt,
          lastModified: result.lastModified,
          mimeType: result.mimeType,
          sourceId: source.id,
          url,
        }))
        return { bytes: result.bytes, mimeType: result.mimeType }
      })),
    ))
  }

  refreshView(input: BrowseShelfInput): Promise<ShelfBrowseResult> {
    return this.dependencies.operations.run(scope => Effect.gen({ self: this }, function* () {
      const storedSources = yield* this.#promise(() => this.dependencies.storage.sources.list())
      const sources = yield* this.#selectSources(storedSources, input.sourceId)
      const groups = yield* scope.all(sources.map(source => scope.source(
        source.id,
        this.#refreshGroup(source, input),
      )))
      return {
        groups,
        refreshedAt: groups.some(group => group.issue === null) ? this.dependencies.now() : null,
      }
    }))
  }

  #cachedGroup(
    source: StoredShelfSource,
    input: BrowseShelfInput,
    issue: ShelfBrowseIssue | null = null,
  ): EffectType.Effect<ShelfBrowseGroup, Error> {
    return Effect.gen({ self: this }, function* () {
      const url = yield* this.#sourcePageUrl(source, input)
      const cached = yield* this.#promise(() => this.dependencies.storage.pages.get(
        source.id,
        url,
      ))
      return { issue, page: cached?.page ?? null, source: toPublicShelfSource(source) }
    })
  }

  #promise<Result>(operation: () => Promise<Result>): EffectType.Effect<Result, Error> {
    return Effect.tryPromise({ catch: toError, try: operation })
  }

  #refreshGroup(
    source: StoredShelfSource,
    input: BrowseShelfInput,
  ): EffectType.Effect<ShelfBrowseGroup, Error> {
    return Effect.gen({ self: this }, function* () {
      const url = yield* this.#sourcePageUrl(source, input)
      const cached = yield* this.#promise(() => this.dependencies.storage.pages.get(source.id, url))
      const credentials = yield* Effect.try({
        catch: toError,
        try: () => this.dependencies.credentials.read(source),
      })
      const outcome = yield* this.dependencies.fetchPage({
        ...(cached?.etag ? { etag: cached.etag } : {}),
        ...(cached?.lastModified ? { lastModified: cached.lastModified } : {}),
        ...(credentials ? { credentials } : {}),
        url,
      }).pipe(
        Effect.map(result => ({ result, status: 'success' as const })),
        Effect.catchEager(error => Effect.succeed({ error, status: 'failed' as const })),
      )
      if (outcome.status === 'failed')
        return yield* this.#cachedGroup(source, input, requestIssue(outcome.error))

      const result = outcome.result
      if (result.status === 'not-modified') {
        if (!cached)
          return yield* Effect.fail(new Error(`Shelf source ${source.id} returned not-modified without a cached page`))
        const refreshed: CachedShelfPage = { ...cached, fetchedAt: result.fetchedAt }
        yield* this.#promise(() => this.dependencies.storage.pages.save(refreshed))
        return { issue: null, page: cached.page, source: toPublicShelfSource(source) }
      }

      yield* this.#promise(() => this.dependencies.storage.pages.save({
        etag: result.etag,
        fetchedAt: result.fetchedAt,
        lastModified: result.lastModified,
        page: result.page,
        sourceId: source.id,
        url,
      }))
      return { issue: null, page: result.page, source: toPublicShelfSource(source) }
    })
  }

  #requireSource(sourceId: string): EffectType.Effect<StoredShelfSource, Error> {
    return Effect.gen({ self: this }, function* () {
      const source = yield* this.#promise(() => this.dependencies.storage.sources.get(sourceId))
      if (!source)
        return yield* Effect.fail(new Error(`Unknown Shelf source: ${sourceId}`))
      return source
    })
  }

  #selectSources(
    sources: readonly StoredShelfSource[],
    sourceId: string | undefined,
  ): EffectType.Effect<readonly StoredShelfSource[], Error> {
    return Effect.try({
      catch: toError,
      try: () => {
        if (sourceId === undefined)
          return sources.filter(source => source.enabled)
        const selected = sources.find(source => source.id === sourceId)
        if (!selected)
          throw new Error(`Unknown Shelf source: ${sourceId}`)
        return [selected]
      },
    })
  }

  #sourcePageUrl(source: StoredShelfSource, input: BrowseShelfInput): EffectType.Effect<string, Error> {
    return Effect.try({
      catch: toError,
      try: () => {
        if (input.pageUrl === undefined)
          return source.url
        if (input.sourceId !== source.id)
          throw new TypeError('A Shelf page URL can only be used with one selected source')
        return normalizeShelfSourceUrl(input.pageUrl)
      },
    })
  }
}
