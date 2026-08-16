import type {
  FetchShelfPublicationInput,
  FetchShelfPublicationResult,
  OpenShelfReadingInput,
  PreparedShelfReading,
  PrepareShelfReadingInput,
  ShelfPublicationDetails,
  ShelfPublicationDetailsInput,
  ShelfReadingDocument,
  ShelfReadingRangeInput,
  ShelfRequestCredentials,
  ShelfRequestError,
  ShelfStorage,
  StoredShelfSource,
} from '@memorilo/shelf'
import type { ShelfReadingFileStore } from '@memorilo/shelf/node'
import type { Effect as EffectType } from 'effect'
import type { ActiveReadingRegistry } from '../reading/active-reading-registry'
import type { ShelfOperationRuntime } from './shelf-operation-runtime'
import { toError } from '@memorilo/effect-lifecycle'
import { shelfReadingAcquisitions } from '@memorilo/shelf'
import { createShelfReadingId } from '@memorilo/shelf/node'
import { Effect } from 'effect'
import { toPublicShelfSource } from './shelf-source-model'

interface ShelfReadingApplicationDependencies {
  activeReadings: Pick<ActiveReadingRegistry, 'isReadingIdActive'>
  confirmDeletion: () => Promise<boolean>
  credentialsForSource: (source: StoredShelfSource) => ShelfRequestCredentials | undefined
  fetchPublication: (
    input: FetchShelfPublicationInput,
  ) => EffectType.Effect<FetchShelfPublicationResult, ShelfRequestError>
  operations: ShelfOperationRuntime
  readingFiles: Pick<
    ShelfReadingFileStore,
    'deleteFromLibrary' | 'find' | 'readRange' | 'retainInLibrary' | 'save'
  >
  storage: Pick<ShelfStorage, 'pages' | 'sources'>
}

/** Owns Shelf reading acquisition, local-file publication, and deletion races. */
export class ShelfReadingApplication {
  constructor(private readonly dependencies: ShelfReadingApplicationDependencies) {}

  delete(readingId: string): Promise<boolean> {
    return this.dependencies.operations.run(scope => scope.reading(
      readingId,
      Effect.gen({ self: this }, function* () {
        yield* this.#requireInactive(readingId)
        if ((yield* this.#promise(() => this.dependencies.readingFiles.find(readingId)))?.location !== 'library')
          return false
        if (!(yield* this.#promise(this.dependencies.confirmDeletion)))
          return false
        yield* this.#requireInactive(readingId)
        if ((yield* this.#promise(() => this.dependencies.readingFiles.find(readingId)))?.location !== 'library')
          return false
        return yield* this.#promise(() => this.dependencies.readingFiles.deleteFromLibrary(readingId))
      }),
    ))
  }

  details(input: ShelfPublicationDetailsInput): Promise<ShelfPublicationDetails> {
    return this.dependencies.operations.run(scope => scope.source(
      input.sourceId,
      Effect.gen({ self: this }, function* () {
        const source = yield* this.#requireSource(input.sourceId)
        const publication = yield* this.#promise(() => (
          this.dependencies.storage.pages.getPublication(source.id, input.publicationId)
        ))
        if (!publication)
          return yield* Effect.fail(new Error('This book is no longer available in the saved Shelf catalog.'))
        const readingOptions = yield* scope.all(shelfReadingAcquisitions(publication).map(acquisition => Effect.gen({ self: this }, function* () {
          const readingId = yield* Effect.try({
            catch: toError,
            try: () => createShelfReadingId(source.id, publication.id, acquisition.format),
          })
          return {
            format: acquisition.format,
            mediaType: acquisition.mediaType,
            readingId,
            savedLocally: (yield* scope.reading(
              readingId,
              this.#promise(() => this.dependencies.readingFiles.find(readingId)),
            ))?.location === 'library',
          }
        })))
        return { publication, readingOptions, source: toPublicShelfSource(source) }
      }),
    ))
  }

  open(input: OpenShelfReadingInput): Promise<ShelfReadingDocument> {
    return this.dependencies.operations.run(scope => scope.reading(
      input.readingId,
      Effect.gen({ self: this }, function* () {
        const file = yield* this.#promise(() => this.dependencies.readingFiles.find(input.readingId))
        if (!file)
          return yield* Effect.fail(new Error('This temporary book is no longer cached. Open it again from Shelf.'))
        return file.document
      }),
    ))
  }

  prepare(input: PrepareShelfReadingInput): Promise<PreparedShelfReading> {
    if (input.retention !== 'cache' && input.retention !== 'library')
      return Promise.reject(new TypeError(`Unsupported Shelf reading retention: ${input.retention}`))
    return this.dependencies.operations.run(scope => scope.source(
      input.sourceId,
      Effect.gen({ self: this }, function* () {
        const readingId = yield* Effect.try({
          catch: toError,
          try: () => createShelfReadingId(input.sourceId, input.publicationId, input.format),
        })
        return yield* scope.reading(readingId, Effect.gen({ self: this }, function* () {
          const source = yield* this.#requireSource(input.sourceId)
          const publication = yield* this.#promise(() => (
            this.dependencies.storage.pages.getPublication(source.id, input.publicationId)
          ))
          if (!publication)
            return yield* Effect.fail(new Error('This book is no longer available in the saved Shelf catalog.'))
          const acquisition = shelfReadingAcquisitions(publication).find(candidate => candidate.format === input.format)
          if (!acquisition) {
            return yield* Effect.fail(
              new Error(`This book does not provide a readable ${input.format.toLocaleUpperCase()} download.`),
            )
          }

          let file = yield* this.#promise(() => this.dependencies.readingFiles.find(readingId))
          if (file?.location === 'cache' && input.retention === 'library') {
            file = yield* this.#promise(() => this.dependencies.readingFiles.retainInLibrary(readingId))
            if (!file)
              return yield* Effect.fail(new Error('The cached book disappeared before it could be saved locally.'))
          }
          if (!file) {
            const credentials = yield* Effect.try({
              catch: toError,
              try: () => this.dependencies.credentialsForSource(source),
            })
            const result = yield* this.dependencies.fetchPublication({
              ...(credentials ? { credentials } : {}),
              format: acquisition.format,
              url: acquisition.href,
            })
            file = yield* this.#promise(() => this.dependencies.readingFiles.save({
              book: { authors: publication.authors, title: publication.title },
              bytes: result.bytes,
              format: acquisition.format,
              name: publication.title,
              publicationId: publication.id,
              readingId,
              retention: input.retention,
              sourceId: source.id,
            }))
          }
          return { book: file.document.book, readingId }
        }))
      }),
    ))
  }

  readRange(input: ShelfReadingRangeInput): Promise<Uint8Array> {
    return this.dependencies.operations.run(scope => scope.reading(
      input.readingId,
      this.#promise(() => this.dependencies.readingFiles.readRange(input)),
    ))
  }

  #requireInactive(readingId: string): EffectType.Effect<void, Error> {
    return Effect.try({
      catch: toError,
      try: () => {
        if (this.dependencies.activeReadings.isReadingIdActive(readingId))
          throw new Error('This book file cannot be deleted while it is open for reading.')
      },
    })
  }

  #promise<Result>(operation: () => Promise<Result>): EffectType.Effect<Result, Error> {
    return Effect.tryPromise({ catch: toError, try: operation })
  }

  #requireSource(sourceId: string): EffectType.Effect<StoredShelfSource, Error> {
    return Effect.gen({ self: this }, function* () {
      const source = yield* this.#promise(() => this.dependencies.storage.sources.get(sourceId))
      if (!source)
        return yield* Effect.fail(new Error(`Unknown Shelf source: ${sourceId}`))
      return source
    })
  }
}
