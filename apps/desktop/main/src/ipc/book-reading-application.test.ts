import type { BookFileBinding } from '@memorilo/reading-model'
import type { ShelfReadingDocument } from '@memorilo/shelf'
import type { BookTopicReadingContext } from '../notes/note-application-service'
import type { ActiveReadingOwner, ActiveReadingRegistry } from '../reading/active-reading-registry'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BookReadingApplication } from './book-reading-application'
import { createShelfOperationRuntime } from './shelf-operation-runtime'

const readingId = 'a'.repeat(64)
const book: BookFileBinding = {
  book: { authors: ['Author'], title: 'Book' },
  file: {
    byteLength: 3,
    format: 'epub',
    originalName: 'Book.epub',
    sha256: 'b'.repeat(64),
  },
  retrievalHints: [{
    kind: 'shelf',
    publicationId: 'publication',
    readingId,
    sourceId: 'source',
  }],
}
const document: ShelfReadingDocument = {
  book,
  byteLength: 3,
  format: 'epub',
  name: 'Book.epub',
}
const context: BookTopicReadingContext = {
  book,
  note: {
    createdAt: 1,
    favorite: false,
    id: 'note',
    kind: 'regular',
    snapshot: new Uint8Array(),
    title: 'Note',
    updatedAt: 1,
  },
  readingState: { annotations: [], position: null },
  topicId: 'topic',
  topicTitle: 'Topic',
}
const owner = {
  isDestroyed: () => false,
  once: () => undefined,
  removeListener: () => undefined,
} satisfies ActiveReadingOwner

const closeOperations: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(closeOperations.splice(0).map(close => close()))
})

function createApplication({
  createBookNote = async () => ({ context, status: 'created' as const }),
  retainInLibrary = async () => ({ document, location: 'library' as const }),
}: {
  createBookNote?: () => Promise<{ context: BookTopicReadingContext, status: 'created' } | { status: 'duplicate-title' }>
  retainInLibrary?: () => Promise<{ document: ShelfReadingDocument, location: 'library' } | null>
} = {}) {
  const operations = createShelfOperationRuntime(1)
  closeOperations.push(operations.close)
  let active = false
  const activeReadings = {
    begin: (input) => {
      active = true
      return { ...input, id: 'session' }
    },
    end: () => {
      active = false
      return true
    },
  } satisfies Pick<ActiveReadingRegistry, 'begin' | 'end'>
  const application = new BookReadingApplication({
    activeReadings,
    notes: {
      createBookNote,
      getBookTopicReadingContext: async () => context,
      rebindBookTopic: async () => context,
    },
    operations,
    readingFiles: {
      find: async () => ({ document, location: 'library' }),
      retainInLibrary,
    },
    storage: {
      bookTopics: {
        listByFile: async () => [],
        listByReadingId: async () => [],
      },
    },
  })
  return { application, isActive: () => active, operations }
}

describe('book reading application', () => {
  it('registers the reading session before a queued deletion can inspect ownership', async () => {
    const retainStarted = deferred<void>()
    const releaseRetain = deferred<void>()
    const { application, isActive, operations } = createApplication({
      retainInLibrary: async () => {
        retainStarted.resolve()
        await releaseRetain.promise
        return { document, location: 'library' }
      },
    })

    const selection = application.selectContext({ noteId: 'note', readingId, topicId: 'topic' }, owner)
    await retainStarted.promise
    let deletionObservedActive: boolean | undefined
    const deletionCheck = operations.run(scope => scope.reading(
      readingId,
      Effect.sync(() => {
        deletionObservedActive = isActive()
      }),
    ))
    await Promise.resolve()
    expect(deletionObservedActive).toBeUndefined()

    releaseRetain.resolve()
    await expect(selection).resolves.toMatchObject({ sessionId: 'session' })
    await deletionCheck
    expect(deletionObservedActive).toBe(true)
  })

  it('retries the context commit after a retained file outlives a persistence failure', async () => {
    const persistenceFailure = new Error('note persistence unavailable')
    const createBookNote = vi.fn()
      .mockRejectedValueOnce(persistenceFailure)
      .mockResolvedValue({ context, status: 'created' })
    const retainInLibrary = vi.fn(async () => ({ document, location: 'library' as const }))
    const { application } = createApplication({ createBookNote, retainInLibrary })
    const input = { noteTitle: 'Note', readingId, topicTitle: 'Topic' }

    await expect(application.createContext(input, owner)).rejects.toBe(persistenceFailure)
    await expect(application.createContext(input, owner)).resolves.toMatchObject({
      sessionId: 'session',
      status: 'created',
    })
    expect(retainInLibrary).toHaveBeenCalledTimes(2)
    expect(createBookNote).toHaveBeenCalledTimes(2)
  })
})
