import type { EditorStorage } from '@memorilo/editor-storage'
import type { ShelfReadingDocument } from '@memorilo/shelf'
import type { ShelfReadingFileStore } from '@memorilo/shelf/node'
import type { Effect as EffectType } from 'effect'
import type { NoteApplicationService } from '../notes/note-application-service'
import type {
  ActiveReadingOwner,
  ActiveReadingRegistry,
} from '../reading/active-reading-registry'
import type { ShelfOperationRuntime } from './shelf-operation-runtime'
import { sameBookFile } from '@memorilo/reading-model'
import { Effect } from 'effect'

export interface CreateBookContextInput {
  noteTitle: string
  readingId: string
  topicTitle: string
}

export interface RebindBookContextInput {
  noteId: string
  readingId: string
  sessionId?: string
  topicId: string
}

export interface SelectBookContextInput {
  noteId: string
  readingId: string
  topicId: string
}

interface BookReadingApplicationDependencies {
  activeReadings: Pick<ActiveReadingRegistry, 'begin' | 'end'>
  notes: Pick<
    NoteApplicationService,
    'createBookNote' | 'getBookTopicReadingContext' | 'rebindBookTopic'
  >
  operations: ShelfOperationRuntime
  readingFiles: Pick<ShelfReadingFileStore, 'find' | 'retainInLibrary'>
  storage: Pick<EditorStorage, 'bookTopics'>
}

/** Owns the file-retention, BookTopic, and renderer-session transaction. */
export class BookReadingApplication {
  constructor(private readonly dependencies: BookReadingApplicationDependencies) {}

  closeSession(sessionId: string, owner: ActiveReadingOwner): boolean {
    return this.dependencies.activeReadings.end(sessionId, owner)
  }

  createContext(input: CreateBookContextInput, owner: ActiveReadingOwner) {
    return this.#withRetainedReading(input.readingId, document => Effect.gen({ self: this }, function* () {
      const result = yield* this.#promise(() => this.dependencies.notes.createBookNote({
        book: document.book,
        noteTitle: input.noteTitle,
        topicTitle: input.topicTitle,
      }))
      if (result.status === 'duplicate-title')
        return result
      const session = yield* this.#beginSession({
        noteId: result.context.note.id,
        readingId: input.readingId,
        topicId: result.context.topicId,
      }, owner)
      return { ...result, sessionId: session.id }
    }))
  }

  isReadingAvailable(readingId: string): Promise<boolean> {
    return this.dependencies.operations.run(scope => scope.reading(
      readingId,
      Effect.map(
        this.#promise(() => this.dependencies.readingFiles.find(readingId)),
        file => file !== null,
      ),
    ))
  }

  listContexts(readingId: string) {
    return this.dependencies.operations.run(scope => scope.reading(
      readingId,
      Effect.gen({ self: this }, function* () {
        const document = yield* this.#requireReading(readingId)
        const [exactContexts, hintedContexts] = yield* Effect.all([
          this.#promise(() => this.dependencies.storage.bookTopics.listByFile(document.book.file)),
          this.#promise(() => this.dependencies.storage.bookTopics.listByReadingId(readingId)),
        ], { concurrency: 'unbounded' })
        const contexts = new Map<string, typeof exactContexts[number]>()
        for (const context of [...exactContexts, ...hintedContexts])
          contexts.set(`${context.noteId}:${context.topicId}`, context)
        return [...contexts.values()]
      }),
    ))
  }

  rebindContext(input: RebindBookContextInput, owner: ActiveReadingOwner) {
    if (input.sessionId !== undefined && input.sessionId.trim().length === 0)
      return Promise.reject(new TypeError('Active reading session id must be a non-empty string'))
    return this.#withRetainedReading(input.readingId, document => Effect.gen({ self: this }, function* () {
      const context = yield* this.#promise(() => this.dependencies.notes.rebindBookTopic({
        book: document.book,
        noteId: input.noteId,
        topicId: input.topicId,
      }))
      const session = yield* this.#beginSession({
        noteId: input.noteId,
        readingId: input.readingId,
        topicId: input.topicId,
      }, owner)
      if (input.sessionId !== undefined)
        this.dependencies.activeReadings.end(input.sessionId, owner)
      return { context, sessionId: session.id }
    }))
  }

  selectContext(input: SelectBookContextInput, owner: ActiveReadingOwner) {
    return this.#withRetainedReading(input.readingId, document => Effect.gen({ self: this }, function* () {
      const context = yield* this.#promise(() => this.dependencies.notes.getBookTopicReadingContext({
        noteId: input.noteId,
        topicId: input.topicId,
      }))
      if (!sameBookFile(document.book.file, context.book.file))
        return yield* Effect.fail(new Error('The selected BookTopic is bound to a different book file.'))
      const session = yield* this.#beginSession(input, owner)
      return { context, sessionId: session.id }
    }))
  }

  #beginSession(
    input: { noteId: string, readingId: string, topicId: string },
    owner: ActiveReadingOwner,
  ) {
    return Effect.try({
      catch: error => error,
      try: () => this.dependencies.activeReadings.begin(input, owner),
    })
  }

  #promise<Result>(operation: () => Promise<Result>): EffectType.Effect<Result, unknown> {
    return Effect.tryPromise({ catch: error => error, try: operation })
  }

  #requireReading(readingId: string): EffectType.Effect<ShelfReadingDocument, unknown> {
    return Effect.gen({ self: this }, function* () {
      const file = yield* this.#promise(() => this.dependencies.readingFiles.find(readingId))
      if (!file)
        return yield* Effect.fail(new Error('This book file is unavailable. Open it again from Shelf.'))
      return file.document
    })
  }

  #withRetainedReading<Result>(
    readingId: string,
    operation: (document: ShelfReadingDocument) => EffectType.Effect<Result, unknown>,
  ): Promise<Result> {
    return this.dependencies.operations.run(scope => scope.reading(
      readingId,
      Effect.gen({ self: this }, function* () {
        const file = yield* this.#promise(() => this.dependencies.readingFiles.retainInLibrary(readingId))
        if (!file)
          return yield* Effect.fail(new Error('This book file is unavailable. Open it again from Shelf.'))
        return yield* operation(file.document)
      }),
    ))
  }
}
