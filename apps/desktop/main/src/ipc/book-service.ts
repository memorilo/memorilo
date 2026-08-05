import type { EditorStorage } from '@memorilo/editor-storage'
import type { ShelfReadingFileStore } from '@memorilo/shelf/node'
import type { NoteApplicationService } from '../notes/note-application-service'
import type { ActiveReadingRegistry } from '../reading/active-reading-registry'
import { sameBookFile } from '@memorilo/reading-model'
import { IpcMethod, IpcService } from 'electron-ipc-decorator'

async function requireReadingFile(readingFiles: ShelfReadingFileStore, readingId: string) {
  const document = await readingFiles.open(readingId)
  if (!document)
    throw new Error('This book file is unavailable. Open it again from Shelf.')
  return document
}

async function promoteReadingFile(readingFiles: ShelfReadingFileStore, readingId: string): Promise<void> {
  if (!await readingFiles.promote(readingId))
    throw new Error('The book file disappeared before it could be kept in the library.')
}

export function createBookService(
  notes: NoteApplicationService,
  storage: EditorStorage,
  readingFiles: ShelfReadingFileStore,
  activeReadings: ActiveReadingRegistry,
) {
  class BookService extends IpcService {
    static override readonly groupName = 'books'

    @IpcMethod()
    async closeReadingSession(sessionId: string): Promise<boolean> {
      return activeReadings.end(sessionId)
    }

    @IpcMethod()
    async createContext(input: { noteTitle: string, readingId: string, topicTitle: string }) {
      const document = await requireReadingFile(readingFiles, input.readingId)
      await promoteReadingFile(readingFiles, input.readingId)
      const result = await notes.createBookNote({
        book: document.book,
        noteTitle: input.noteTitle,
        topicTitle: input.topicTitle,
      })
      if (result.status === 'duplicate-title')
        return result
      const session = activeReadings.begin({
        noteId: result.context.note.id,
        readingId: input.readingId,
        topicId: result.context.topicId,
      })
      return { ...result, sessionId: session.id }
    }

    @IpcMethod()
    async isReadingAvailable(readingId: string): Promise<boolean> {
      return await readingFiles.getLocation(readingId) !== 'missing'
    }

    @IpcMethod()
    async listContexts(readingId: string) {
      const document = await requireReadingFile(readingFiles, readingId)
      const [exactContexts, hintedContexts] = await Promise.all([
        storage.listBookTopicContextsByFile(document.book.file),
        storage.listBookTopicContextsByReadingId(readingId),
      ])
      const contexts = new Map<string, typeof exactContexts[number]>()
      for (const context of [...exactContexts, ...hintedContexts])
        contexts.set(`${context.noteId}:${context.topicId}`, context)
      return [...contexts.values()]
    }

    @IpcMethod()
    async rebindContext(input: {
      noteId: string
      readingId: string
      sessionId?: string
      topicId: string
    }) {
      const document = await requireReadingFile(readingFiles, input.readingId)
      await promoteReadingFile(readingFiles, input.readingId)
      const context = await notes.rebindBookTopic({
        book: document.book,
        noteId: input.noteId,
        topicId: input.topicId,
      })
      if (input.sessionId !== undefined)
        activeReadings.end(input.sessionId)
      const session = activeReadings.begin({
        noteId: input.noteId,
        readingId: input.readingId,
        topicId: input.topicId,
      })
      return { context, sessionId: session.id }
    }

    @IpcMethod()
    async selectContext(input: { noteId: string, readingId: string, topicId: string }) {
      const [document, context] = await Promise.all([
        requireReadingFile(readingFiles, input.readingId),
        notes.getBookTopicReadingContext({ noteId: input.noteId, topicId: input.topicId }),
      ])
      if (!sameBookFile(document.book.file, context.book.file))
        throw new Error('The selected BookTopic is bound to a different book file.')
      await promoteReadingFile(readingFiles, input.readingId)
      const session = activeReadings.begin(input)
      return { context, sessionId: session.id }
    }
  }

  return BookService
}
