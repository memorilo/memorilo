import type {
  CreateDesktopBookContextResult,
  DesktopBookTopicContextSummary,
  DesktopBookTopicReadingContext,
} from '@memorilo/desktop-api'
import type { ReaderContextSession } from './reader-context-session'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createReaderContextSession,

} from './reader-context-session'

const currentSha256 = 'a'.repeat(64)

function summary(
  overrides: {
    format?: 'epub' | 'pdf'
    noteId?: string
    sha256?: string
    topicId?: string
  } = {},
): DesktopBookTopicContextSummary {
  const noteId = overrides.noteId ?? 'note-1'
  const topicId = overrides.topicId ?? 'topic-1'
  return {
    book: {
      book: { authors: ['Author'], title: 'Book' },
      file: {
        byteLength: 100,
        format: overrides.format ?? 'pdf',
        originalName: 'book.pdf',
        sha256: overrides.sha256 ?? currentSha256,
      },
      retrievalHints: [{ kind: 'local', readingId: 'reading-1' }],
    },
    noteId,
    noteTitle: 'Note',
    topicId,
    topicTitle: 'Topic',
  }
}

function readingContext(
  contextSummary = summary(),
): DesktopBookTopicReadingContext {
  return {
    book: contextSummary.book,
    note: {
      createdAt: 1,
      favorite: false,
      id: contextSummary.noteId,
      kind: 'regular',
      snapshot: new Uint8Array(),
      title: contextSummary.noteTitle,
      updatedAt: 1,
    },
    readingState: { annotations: [], position: null },
    topicId: contextSummary.topicId,
    topicTitle: contextSummary.topicTitle,
  }
}

const openSessions: ReaderContextSession[] = []

function createHarness() {
  const context = readingContext()
  const closeBookReadingSession = vi.fn(async () => true)
  const createBookContext = vi.fn(async (): Promise<CreateDesktopBookContextResult> => ({
    context,
    sessionId: 'created-session',
    status: 'created' as const,
  }))
  const rebindBookContext = vi.fn(async () => ({
    context,
    sessionId: 'rebound-session',
  }))
  const selectBookContext = vi.fn(async () => ({
    context,
    sessionId: 'selected-session',
  }))
  const flush = vi.fn(async () => undefined)
  const onCleanupError = vi.fn()
  const session = createReaderContextSession({
    currentFile: summary().book.file,
    flush,
    onCleanupError,
    readingId: 'reading-1',
    transport: {
      closeBookReadingSession,
      createBookContext,
      rebindBookContext,
      selectBookContext,
    },
  })
  openSessions.push(session)
  return {
    closeBookReadingSession,
    context,
    createBookContext,
    flush,
    onCleanupError,
    rebindBookContext,
    selectBookContext,
    session,
  }
}

afterEach(async () => {
  await Promise.allSettled(openSessions.splice(0).map(session => session.close()))
})

describe('reader context session', () => {
  it('normalizes creation titles and reports validation and duplicate outcomes', async () => {
    const harness = createHarness()

    await expect(harness.session.execute({
      kind: 'create',
      noteTitle: '   ',
      topicTitle: 'Topic',
    })).resolves.toEqual({ status: 'invalid-titles' })
    expect(harness.createBookContext).not.toHaveBeenCalled()

    harness.createBookContext.mockResolvedValueOnce({ status: 'duplicate-title' })
    await expect(harness.session.execute({
      kind: 'create',
      noteTitle: '  Note  ',
      topicTitle: '  Topic  ',
    })).resolves.toEqual({
      noteTitle: 'Note',
      status: 'duplicate-title',
      topicTitle: 'Topic',
    })
    expect(harness.createBookContext).toHaveBeenCalledWith({
      noteTitle: 'Note',
      readingId: 'reading-1',
      topicTitle: 'Topic',
    })
  })

  it('selects the current file and returns structured rebind and format outcomes', async () => {
    const harness = createHarness()
    const current = summary()

    await expect(harness.session.execute({ context: current, kind: 'select' })).resolves.toEqual({
      action: 'selected',
      context: harness.context,
      sessionId: 'selected-session',
      status: 'connected',
    })
    await expect(harness.session.execute({
      context: summary({ sha256: 'b'.repeat(64) }),
      kind: 'select',
    })).resolves.toMatchObject({ status: 'requires-rebind' })
    await expect(harness.session.execute({
      context: summary({ format: 'epub' }),
      kind: 'select',
    })).resolves.toEqual({ status: 'format-mismatch' })
    expect(harness.selectBookContext).toHaveBeenCalledOnce()
    expect(harness.rebindBookContext).not.toHaveBeenCalled()
  })

  it('rebinds through the same owner and flushes the previous accepted session', async () => {
    const harness = createHarness()
    await harness.session.execute({ context: summary(), kind: 'select' })

    await expect(harness.session.execute({
      context: summary({ sha256: 'b'.repeat(64) }),
      kind: 'rebind',
    })).resolves.toEqual({
      action: 'rebound',
      context: harness.context,
      sessionId: 'rebound-session',
      status: 'connected',
    })
    await vi.waitFor(() => {
      expect(harness.closeBookReadingSession).toHaveBeenCalledWith('selected-session')
    })
    expect(harness.flush).toHaveBeenCalledOnce()
  })

  it('persists the active Note before requesting a replacement context snapshot', async () => {
    const harness = createHarness()
    await harness.session.execute({ context: summary(), kind: 'select' })
    const persisted = deferred<undefined>()
    harness.flush.mockImplementationOnce(() => persisted.promise)
    harness.selectBookContext.mockResolvedValueOnce({
      context: harness.context,
      sessionId: 'replacement-session',
    })

    const replacement = harness.session.execute({
      context: summary({ noteId: 'note-2', topicId: 'topic-2' }),
      kind: 'select',
    })
    await vi.waitFor(() => expect(harness.flush).toHaveBeenCalledOnce())

    expect(harness.selectBookContext).toHaveBeenCalledOnce()
    persisted.resolve(undefined)
    await expect(replacement).resolves.toMatchObject({
      sessionId: 'replacement-session',
      status: 'connected',
    })
    expect(harness.selectBookContext).toHaveBeenCalledTimes(2)
  })

  it('reclaims a stale late session and accepts the latest command', async () => {
    const harness = createHarness()
    const first = deferred<{
      context: DesktopBookTopicReadingContext
      sessionId: string
      status: 'created'
    }>()
    const second = deferred<{
      context: DesktopBookTopicReadingContext
      sessionId: string
    }>()
    harness.createBookContext.mockImplementationOnce(() => first.promise)
    harness.selectBookContext.mockImplementationOnce(() => second.promise)

    const firstResult = harness.session.execute({
      kind: 'create',
      noteTitle: 'Note',
      topicTitle: 'Topic',
    })
    const secondResult = harness.session.execute({ context: summary(), kind: 'select' })
    first.resolve({
      context: harness.context,
      sessionId: 'stale-session',
      status: 'created',
    })

    await expect(firstResult).resolves.toEqual({ status: 'superseded' })
    expect(harness.closeBookReadingSession).toHaveBeenCalledWith('stale-session')
    second.resolve({ context: harness.context, sessionId: 'current-session' })
    await expect(secondResult).resolves.toMatchObject({
      action: 'selected',
      sessionId: 'current-session',
      status: 'connected',
    })
  })

  it('propagates a current transport failure and releases admission for retry', async () => {
    const harness = createHarness()
    harness.selectBookContext.mockRejectedValueOnce(new Error('IPC unavailable'))

    await expect(harness.session.execute({
      context: summary(),
      kind: 'select',
    })).rejects.toThrow('IPC unavailable')
    await expect(harness.session.execute({
      context: summary(),
      kind: 'select',
    })).resolves.toMatchObject({
      action: 'selected',
      status: 'connected',
    })
  })
})
