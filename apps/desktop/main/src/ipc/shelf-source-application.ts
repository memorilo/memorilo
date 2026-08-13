import type {
  AddShelfSourceInput,
  FetchShelfPageInput,
  FetchShelfPageResult,
  ShelfImageCache,
  ShelfRequestCredentials,
  ShelfSource,
  ShelfStorage,
  StoredShelfSource,
  UpdateShelfSourceInput,
} from '@memorilo/shelf'
import type { Effect as EffectType } from 'effect'
import type { ShelfOperationRuntime } from './shelf-operation-runtime'
import type { ShelfCredentialAccess } from './shelf-source-model'
import { Effect } from 'effect'
import { normalizeShelfSourceUrl, toPublicShelfSource } from './shelf-source-model'

interface ShelfSourceApplicationDependencies {
  credentials: ShelfCredentialAccess
  fetchPage: (input: FetchShelfPageInput) => EffectType.Effect<FetchShelfPageResult, unknown>
  imageCache: Pick<ShelfImageCache, 'deleteSource'>
  now: () => number
  operations: ShelfOperationRuntime
  randomId: () => string
  storage: Pick<ShelfStorage, 'sources'>
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

/** Owns source validation, credential mutation, persistence, and removal ordering. */
export class ShelfSourceApplication {
  constructor(private readonly dependencies: ShelfSourceApplicationDependencies) {}

  add(input: AddShelfSourceInput): Promise<ShelfSource> {
    return this.dependencies.operations.run(() => Effect.gen({ self: this }, function* () {
      const url = normalizeShelfSourceUrl(input.url)
      const credentials = credentialsFromInput(input)
      const encryptedPassword = credentials
        ? this.dependencies.credentials.encrypt(credentials.password)
        : null
      const result = yield* this.dependencies.fetchPage({
        ...(credentials ? { credentials } : {}),
        url,
      })
      if (result.status === 'not-modified')
        throw new Error('A new Shelf source cannot return not-modified')
      const now = this.dependencies.now()
      const id = this.dependencies.randomId()
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
      yield* this.#promise(() => this.dependencies.storage.sources.saveWithPage({
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
      }))
      return source
    }))
  }

  list(): Promise<readonly ShelfSource[]> {
    return this.dependencies.operations.run(() => Effect.map(
      this.#promise(() => this.dependencies.storage.sources.list()),
      sources => sources.map(toPublicShelfSource),
    ))
  }

  remove(sourceId: string): Promise<void> {
    return this.dependencies.operations.run(scope => scope.sourceExclusive(
      sourceId,
      Effect.gen({ self: this }, function* () {
        // Keep the source visible until disposable cache state is gone. Both
        // phases are idempotent, so a failed deletion can retry from the start.
        yield* Effect.tryPromise({
          catch: error => new Error(`Failed to remove Shelf image cache ${sourceId}`, { cause: error }),
          try: () => this.dependencies.imageCache.deleteSource(sourceId),
        })
        yield* Effect.tryPromise({
          catch: error => new Error(`Failed to remove Shelf source ${sourceId}`, { cause: error }),
          try: () => this.dependencies.storage.sources.delete(sourceId),
        })
      }),
    ))
  }

  update(input: UpdateShelfSourceInput): Promise<ShelfSource> {
    return this.dependencies.operations.run(scope => scope.sourceExclusive(
      input.id,
      Effect.gen({ self: this }, function* () {
        const current = yield* this.#requireSource(input.id)
        const url = normalizeShelfSourceUrl(input.url)
        const name = normalizedOptionalInput(input.name)
        if (name === undefined)
          throw new TypeError('Book source name is required')

        const requestedUsername = normalizedOptionalInput(input.username)
        const requestedPassword = normalizedOptionalInput(input.password)
        const preservedCredentials = input.clearCredentials ? undefined : this.dependencies.credentials.read(current)
        const username = input.clearCredentials ? undefined : requestedUsername ?? preservedCredentials?.username
        const password = input.clearCredentials ? undefined : requestedPassword ?? preservedCredentials?.password
        if ((username === undefined) !== (password === undefined))
          throw new TypeError('Username and password must be provided together')
        const credentials = username === undefined || password === undefined ? undefined : { password, username }
        const result = yield* this.dependencies.fetchPage({
          ...(credentials ? { credentials } : {}),
          url,
        })
        if (result.status === 'not-modified')
          throw new Error('An updated Shelf source cannot return not-modified')

        const source: ShelfSource = {
          ...toPublicShelfSource(current),
          auth: credentials ? 'basic' : 'none',
          name,
          updatedAt: this.dependencies.now(),
          url,
          username: credentials?.username ?? null,
        }
        yield* this.#promise(() => this.dependencies.storage.sources.saveWithPage({
          encryptedPassword: credentials
            ? requestedPassword === undefined
              ? current.encryptedPassword
              : this.dependencies.credentials.encrypt(requestedPassword)
            : null,
          page: {
            etag: result.etag,
            fetchedAt: result.fetchedAt,
            lastModified: result.lastModified,
            page: result.page,
            sourceId: source.id,
            url,
          },
          source,
        }))
        return source
      }),
    ))
  }

  #promise<Result>(operation: () => Promise<Result>): EffectType.Effect<Result, unknown> {
    return Effect.tryPromise({ catch: error => error, try: operation })
  }

  #requireSource(sourceId: string): EffectType.Effect<StoredShelfSource, unknown> {
    return Effect.gen({ self: this }, function* () {
      const source = yield* this.#promise(() => this.dependencies.storage.sources.get(sourceId))
      if (!source)
        return yield* Effect.fail(new Error(`Unknown Shelf source: ${sourceId}`))
      return source
    })
  }
}
