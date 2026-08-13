import type {
  ShelfPublication,
  ShelfStorage,
  StoredShelfSource,
} from '@memorilo/shelf'
import type { ShelfOperationRuntime } from './shelf-operation-runtime'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { createShelfReadingId } from '@memorilo/shelf/node'
import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createShelfOperationRuntime } from './shelf-operation-runtime'
import { ShelfReadingApplication } from './shelf-reading-application'

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

const publication: ShelfPublication = {
  authors: ['Author'],
  coverUrl: null,
  id: 'publication-1',
  links: [{
    href: 'https://books.example.test/publication.epub',
    rel: 'http://opds-spec.org/acquisition',
    type: 'application/epub+zip',
  }],
  section: null,
  subtitle: null,
  summary: null,
  title: 'Publication',
}

const readingId = createShelfReadingId(source.id, publication.id, 'epub')
const book = {
  book: { authors: ['Author'], title: 'Publication' },
  file: {
    byteLength: 3,
    format: 'epub' as const,
    originalName: 'Publication.epub',
    sha256: 'a'.repeat(64),
  },
  retrievalHints: [{
    kind: 'shelf' as const,
    publicationId: publication.id,
    readingId,
    sourceId: source.id,
  }],
}
const document = { book, byteLength: 3, format: 'epub' as const, name: 'Publication.epub' }
const runtimes: ShelfOperationRuntime[] = []

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(runtime => runtime.close()))
})

function createApplication({
  confirmDeletion = async () => true,
  deleteFromLibrary = async () => true,
  find = async () => ({ document, location: 'cache' as const }),
  isActive = () => false,
  promote = async () => ({ document, location: 'library' as const }),
}: {
  confirmDeletion?: () => Promise<boolean>
  deleteFromLibrary?: (id: string) => Promise<boolean>
  find?: (id: string) => Promise<{ document: typeof document, location: 'cache' | 'library' } | null>
  isActive?: (id: string) => boolean
  promote?: (id: string) => Promise<{ document: typeof document, location: 'library' } | null>
} = {}) {
  const runtime = createShelfOperationRuntime(2)
  runtimes.push(runtime)
  const storage: Pick<ShelfStorage, 'pages' | 'sources'> = {
    pages: {
      get: async () => null,
      getPublication: async () => publication,
      save: async () => undefined,
    },
    sources: {
      acknowledgeOperations: async () => undefined,
      delete: async () => undefined,
      get: async id => id === source.id ? source : null,
      list: async () => [source],
      listPendingOperations: async () => [],
      mergeOperations: async () => undefined,
      save: async () => undefined,
      saveWithPage: async () => undefined,
    },
  }
  return new ShelfReadingApplication({
    activeReadings: { isReadingIdActive: isActive },
    confirmDeletion,
    credentialsForSource: () => undefined,
    fetchPublication: () => Effect.succeed({
      bytes: Uint8Array.from([1, 2, 3]),
      mimeType: 'application/epub+zip',
    }),
    operations: runtime,
    readingFiles: {
      deleteFromLibrary,
      find,
      retainInLibrary: promote,
      readRange: async () => Uint8Array.from([1]),
      save: async () => ({ document, location: 'cache' }),
    },
    storage,
  })
}

describe('shelf reading application', () => {
  it('keeps an accepted open read ahead of deletion in the same reading lane', async () => {
    const readStarted = deferred()
    const readResult = deferred<{ document: typeof document, location: 'cache' } | null>()
    const confirmDeletion = vi.fn(async () => false)
    let reads = 0
    const application = createApplication({
      confirmDeletion,
      find: async () => {
        reads += 1
        if (reads === 1) {
          readStarted.resolve()
          return readResult.promise
        }
        return { document, location: 'library' }
      },
    })

    const opened = application.open({ readingId })
    await readStarted.promise
    const deletion = application.delete(readingId)
    await Promise.resolve()
    expect(confirmDeletion).not.toHaveBeenCalled()

    readResult.resolve({ document, location: 'cache' })
    await expect(opened).resolves.toEqual(document)
    await expect(deletion).resolves.toBe(false)
    expect(confirmDeletion).toHaveBeenCalledOnce()
  })

  it('promotes a cached reading without downloading it again', async () => {
    const promote = vi.fn(async () => ({ document, location: 'library' as const }))
    const application = createApplication({ promote })

    await expect(application.prepare({
      format: 'epub',
      publicationId: publication.id,
      retention: 'library',
      sourceId: source.id,
    })).resolves.toEqual({ book, readingId })
    expect(promote).toHaveBeenCalledWith(readingId)
  })

  it('reports when a cached reading disappears during promotion', async () => {
    const application = createApplication({ promote: async () => null })

    await expect(application.prepare({
      format: 'epub',
      publicationId: publication.id,
      retention: 'library',
      sourceId: source.id,
    })).rejects.toThrow('The cached book disappeared before it could be saved locally.')
  })

  it('rechecks active ownership after deletion confirmation', async () => {
    let active = false
    const deleteFromLibrary = vi.fn(async () => true)
    const application = createApplication({
      confirmDeletion: async () => {
        active = true
        return true
      },
      deleteFromLibrary,
      find: async () => ({ document, location: 'library' }),
      isActive: () => active,
    })

    await expect(application.delete(readingId)).rejects.toThrow(
      'This book file cannot be deleted while it is open for reading.',
    )
    expect(deleteFromLibrary).not.toHaveBeenCalled()
  })

  it('does not delete a file removed by another owner during confirmation', async () => {
    let reads = 0
    const deleteFromLibrary = vi.fn(async () => true)
    const application = createApplication({
      deleteFromLibrary,
      find: async () => {
        reads += 1
        return reads === 1 ? { document, location: 'library' } : null
      },
    })

    await expect(application.delete(readingId)).resolves.toBe(false)
    expect(deleteFromLibrary).not.toHaveBeenCalled()
  })
})
