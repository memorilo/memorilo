import type {
  CachedShelfAsset,
  CachedShelfPage,
  FetchShelfAssetInput,
  FetchShelfAssetResult,
  FetchShelfPageInput,
  FetchShelfPageResult,
  ShelfPage,
  ShelfRequestError,
  ShelfStorage,
  StoredShelfSource,
} from '@memorilo/shelf'
import type { ShelfOperationRuntime } from './shelf-operation-runtime'
import {
  ShelfAuthenticationError,
  ShelfNetworkError,
  ShelfParseError,
  ShelfResponseError,
} from '@memorilo/shelf'
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShelfCatalogBrowser } from './shelf-catalog-browser'
import { createShelfOperationRuntime } from './shelf-operation-runtime'
import { ShelfSourceApplication } from './shelf-source-application'

const source: StoredShelfSource = {
  addedAt: 1,
  auth: 'none',
  enabled: true,
  encryptedPassword: null,
  fieldClocks: {
    auth: '1:0:actor',
    deleted: '1:0:actor',
    enabled: '1:0:actor',
    name: '1:0:actor',
    orderKey: '1:0:actor',
    url: '1:0:actor',
    username: '1:0:actor',
  },
  id: 'source-1',
  kind: 'opds',
  name: 'Books',
  orderKey: '0000000000001:source-1',
  updatedAt: 1,
  url: 'https://books.example.test/catalog',
  username: null,
}

const page: ShelfPage = {
  navigation: [],
  nextUrl: null,
  publications: [],
  selfUrl: source.url,
  subtitle: null,
  title: 'Books',
}

const runtimes: ShelfOperationRuntime[] = []

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.close()))
})

function createShelfModules({
  cached = null,
  cachedAsset = null,
  deleteSource = async () => undefined,
  deleteSourceImages = async () => undefined,
  encrypt = password => new TextEncoder().encode(password),
  fetchAsset = (_request: FetchShelfAssetInput) => Effect.fail(new ShelfNetworkError({ message: 'unused asset fetch' })),
  fetchPage = (_request: FetchShelfPageInput) => Effect.succeed<FetchShelfPageResult>({
    etag: 'etag-2',
    fetchedAt: 2,
    lastModified: null,
    page,
    status: 'updated',
  }),
  savePage = async (_value: CachedShelfPage) => undefined,
  saveAsset = async (_value: CachedShelfAsset) => undefined,
}: {
  cached?: CachedShelfPage | null
  cachedAsset?: CachedShelfAsset | null
  deleteSource?: (sourceId: string) => Promise<void>
  deleteSourceImages?: (sourceId: string) => Promise<void>
  encrypt?: (password: string) => Uint8Array
  fetchAsset?: (request: FetchShelfAssetInput) => Effect.Effect<FetchShelfAssetResult, ShelfRequestError>
  fetchPage?: (request: FetchShelfPageInput) => Effect.Effect<FetchShelfPageResult, ShelfRequestError>
  savePage?: (value: CachedShelfPage) => Promise<void>
  saveAsset?: (value: CachedShelfAsset) => Promise<void>
} = {}) {
  const runtime = createShelfOperationRuntime(2)
  runtimes.push(runtime)
  const storage: Pick<ShelfStorage, 'pages' | 'sources'> = {
    pages: {
      get: async () => cached,
      getPublication: async () => null,
      save: savePage,
    },
    sources: {
      acknowledgeOperations: async () => undefined,
      delete: deleteSource,
      get: async sourceId => sourceId === source.id ? source : null,
      list: async () => [source],
      listPendingOperations: async () => [],
      mergeOperations: async () => undefined,
      save: async () => undefined,
      saveWithPage: async () => undefined,
    },
  }
  const credentials = {
    encrypt,
    read: () => undefined,
  }
  const sources = new ShelfSourceApplication({
    credentials,
    fetchPage,
    imageCache: {
      deleteSource: deleteSourceImages,
    },
    now: () => 10,
    operations: runtime,
    randomId: () => 'source-new',
    storage,
  })
  const catalog = new ShelfCatalogBrowser({
    credentials,
    fetchAsset,
    fetchPage,
    imageCache: {
      get: async () => cachedAsset,
      save: saveAsset,
    },
    now: () => 10,
    operations: runtime,
    storage,
  })
  return { catalog, sources }
}

describe('shelf source and catalog applications', () => {
  it('rejects unavailable credential persistence before making a network request', async () => {
    const fetchPage = vi.fn((_request: FetchShelfPageInput) => Effect.succeed<FetchShelfPageResult>({
      etag: null,
      fetchedAt: 2,
      lastModified: null,
      page,
      status: 'updated',
    }))
    const { sources } = createShelfModules({
      encrypt: () => {
        throw new Error('credential storage unavailable')
      },
      fetchPage,
    })

    await expect(sources.add({
      password: 'secret',
      url: source.url,
      username: 'reader',
    })).rejects.toThrow('credential storage unavailable')
    expect(fetchPage).not.toHaveBeenCalled()
  })

  it('falls back to cached data only when fetching fails', async () => {
    const cached: CachedShelfPage = {
      etag: 'etag-1',
      fetchedAt: 1,
      lastModified: null,
      page,
      sourceId: source.id,
      url: source.url,
    }
    const savePage = vi.fn(async (_value: CachedShelfPage) => undefined)
    const result = await createShelfModules({
      cached,
      fetchPage: () => Effect.fail(new ShelfNetworkError({ message: 'offline' })),
      savePage,
    }).catalog.refreshView({ sourceId: source.id })

    expect(result).toEqual({
      groups: [{
        issue: { kind: 'network' },
        page,
        source: expect.objectContaining({ id: source.id }),
      }],
      refreshedAt: null,
    })
    expect(savePage).not.toHaveBeenCalled()
  })

  it.each([
    [
      new ShelfAuthenticationError({ message: 'credentials rejected', url: source.url }),
      { kind: 'authentication' },
    ],
    [new ShelfNetworkError({ message: 'offline' }), { kind: 'network' }],
    [
      new ShelfParseError({ message: 'invalid OPDS', url: source.url }),
      { kind: 'parse' },
    ],
    [
      new ShelfResponseError({ message: 'upstream failed', status: 503, url: source.url }),
      { kind: 'response', status: 503 },
    ],
  ] as const)('returns a structured browse issue for %s', async (failure, expectedIssue) => {
    const result = await createShelfModules({
      fetchPage: () => Effect.fail(failure),
    }).catalog.refreshView({ sourceId: source.id })

    expect(result.groups[0]?.issue).toEqual(expectedIssue)
  })

  it('propagates cache persistence failures instead of labeling them network issues', async () => {
    const { catalog } = createShelfModules({
      savePage: async () => {
        throw new Error('database unavailable')
      },
    })

    await expect(catalog.refreshView({ sourceId: source.id })).rejects.toThrow('database unavailable')
  })

  it('persists a refreshed timestamp for a not-modified response', async () => {
    const cached: CachedShelfPage = {
      etag: 'etag-1',
      fetchedAt: 1,
      lastModified: 'yesterday',
      page,
      sourceId: source.id,
      url: source.url,
    }
    const savePage = vi.fn(async (_value: CachedShelfPage) => undefined)
    const result = await createShelfModules({
      cached,
      fetchPage: () => Effect.succeed({ fetchedAt: 3, status: 'not-modified' }),
      savePage,
    }).catalog.refreshView({ sourceId: source.id })

    expect(result.groups[0]?.issue).toBeNull()
    expect(result.groups[0]?.page).toBe(page)
    expect(savePage).toHaveBeenCalledWith({ ...cached, fetchedAt: 3 })
  })

  it('publishes a fetched asset to cache before returning it', async () => {
    const bytes = Uint8Array.from([1, 2, 3])
    const fetchAsset = vi.fn((_request: FetchShelfAssetInput) => Effect.succeed<FetchShelfAssetResult>({
      bytes,
      etag: 'asset-etag',
      fetchedAt: 4,
      lastModified: null,
      mimeType: 'image/png',
      status: 'updated',
    }))
    const saveAsset = vi.fn(async (_value: CachedShelfAsset) => undefined)
    const { catalog } = createShelfModules({ fetchAsset, saveAsset })

    await expect(catalog.getAsset({
      sourceId: source.id,
      url: 'https://books.example.test/cover.png',
    })).resolves.toEqual({ bytes, mimeType: 'image/png' })
    expect(saveAsset).toHaveBeenCalledWith({
      bytes,
      etag: 'asset-etag',
      fetchedAt: 4,
      lastModified: null,
      mimeType: 'image/png',
      sourceId: source.id,
      url: 'https://books.example.test/cover.png',
    })
  })

  it('keeps the source visible when image cleanup fails', async () => {
    const deleteSource = vi.fn(async () => undefined)
    const { sources } = createShelfModules({
      deleteSource,
      deleteSourceImages: async () => {
        throw new Error('image cache unavailable')
      },
    })

    await expect(sources.remove(source.id)).rejects.toThrow('Failed to remove Shelf image cache source-1')
    expect(deleteSource).not.toHaveBeenCalled()
  })

  it('retries the idempotent cache phase after source deletion fails', async () => {
    const deleteSourceImages = vi.fn(async () => undefined)
    const deleteSource = vi.fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue(undefined)
    const { sources } = createShelfModules({ deleteSource, deleteSourceImages })

    await expect(sources.remove(source.id)).rejects.toThrow('Failed to remove Shelf source source-1')
    await expect(sources.remove(source.id)).resolves.toBeUndefined()
    expect(deleteSourceImages).toHaveBeenCalledTimes(2)
    expect(deleteSource).toHaveBeenCalledTimes(2)
  })
})
