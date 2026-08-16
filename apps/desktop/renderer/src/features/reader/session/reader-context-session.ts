import type {
  CreateDesktopBookContextResult,
  DesktopApi,
  DesktopBookTopicContextSummary,
  DesktopBookTopicReadingContext,
  OpenDesktopBookContextResult,
} from '@memorilo/desktop-api'
import { sameBookFile } from '@memorilo/reading-model'
import { createReaderSessionOwner } from './reader-session-owner'

type ReaderContextTransport = Pick<DesktopApi, | 'closeBookReadingSession'
  | 'createBookContext'
  | 'rebindBookContext'
  | 'selectBookContext'>

export type ReaderContextCommand
  = | {
    kind: 'create'
    noteTitle: string
    topicTitle: string
  }
  | {
    context: DesktopBookTopicContextSummary
    kind: 'rebind'
  }
  | {
    context: DesktopBookTopicContextSummary
    kind: 'select'
  }

export type ReaderContextOutcome
  = | {
    action: 'created' | 'rebound' | 'selected'
    context: DesktopBookTopicReadingContext
    sessionId: string
    status: 'connected'
  }
  | {
    noteTitle: string
    status: 'duplicate-title'
    topicTitle: string
  }
  | { status: 'format-mismatch' }
  | { status: 'invalid-titles' }
  | {
    context: DesktopBookTopicContextSummary
    status: 'requires-rebind'
  }
  | { status: 'superseded' }

export interface ReaderContextSession {
  close: () => Promise<void>
  execute: (command: ReaderContextCommand) => Promise<ReaderContextOutcome>
}

interface CreateReaderContextSessionOptions {
  currentFile: DesktopBookTopicContextSummary['book']['file']
  flush: () => Promise<void>
  onCleanupError: (error: unknown) => void
  readingId: string
  transport: ReaderContextTransport
}

function connected(
  action: Extract<ReaderContextOutcome, { status: 'connected' }>['action'],
  result: OpenDesktopBookContextResult,
): ReaderContextOutcome {
  return {
    action,
    context: result.context,
    sessionId: result.sessionId,
    status: 'connected',
  }
}

export function createReaderContextSession({
  currentFile,
  flush,
  onCleanupError,
  readingId,
  transport,
}: CreateReaderContextSessionOptions): ReaderContextSession {
  const owner = createReaderSessionOwner({
    closeSession: async (sessionId) => {
      await transport.closeBookReadingSession(sessionId)
    },
    flush,
    onCleanupError,
  })

  const execute = async (command: ReaderContextCommand): Promise<ReaderContextOutcome> => {
    if (command.kind === 'create') {
      const noteTitle = command.noteTitle.trim()
      const topicTitle = command.topicTitle.trim()
      if (!noteTitle || !topicTitle)
        return { status: 'invalid-titles' }

      const acquisition = await owner.acquire<CreateDesktopBookContextResult>(
        () => transport.createBookContext({ noteTitle, readingId, topicTitle }),
      )
      if (acquisition.status === 'superseded')
        return acquisition
      if (acquisition.value.status === 'duplicate-title') {
        return {
          noteTitle,
          status: 'duplicate-title',
          topicTitle,
        }
      }
      return connected('created', acquisition.value)
    }

    if (command.context.book.file.format !== currentFile.format)
      return { status: 'format-mismatch' }
    if (command.kind === 'select' && !sameBookFile(command.context.book.file, currentFile)) {
      return {
        context: command.context,
        status: 'requires-rebind',
      }
    }

    const acquisition = await owner.acquire(
      command.kind === 'select'
        ? () => transport.selectBookContext({
            noteId: command.context.noteId,
            readingId,
            topicId: command.context.topicId,
          })
        : () => transport.rebindBookContext({
            noteId: command.context.noteId,
            readingId,
            topicId: command.context.topicId,
          }),
    )
    if (acquisition.status === 'superseded')
      return acquisition
    return connected(command.kind === 'select' ? 'selected' : 'rebound', acquisition.value)
  }

  return {
    close: owner.close,
    execute,
  }
}
