import type { LatestOperationResult } from '@memorilo/effect-lifecycle'
import {
  createLatestOperationSupervisor,
  createResourceScope,
  runLifecycleOperations,
} from '@memorilo/effect-lifecycle'
import { cleanupReaderSession } from './reader-session-cleanup'

export type ReaderSessionAcquisition<Result> = LatestOperationResult<Result>

export interface ReaderSessionOwner {
  acquire: <Result>(
    operation: (signal: AbortSignal) => Promise<Result>,
  ) => Promise<ReaderSessionAcquisition<Result>>
  close: () => Promise<void>
}

export interface CreateReaderSessionOwnerOptions {
  closeSession: (sessionId: string) => Promise<void>
  flush: () => Promise<void>
  onCleanupError: (error: unknown) => void
}

interface OwnedSession {
  requiresFinalFlush: boolean
}

function sessionIdOf(value: unknown): string | undefined {
  return typeof value === 'object'
    && value !== null
    && 'sessionId' in value
    && typeof value.sessionId === 'string'
    && value.sessionId.length > 0
    ? value.sessionId
    : undefined
}

export function createReaderSessionOwner({
  closeSession,
  flush,
  onCleanupError,
}: CreateReaderSessionOwnerOptions): ReaderSessionOwner {
  const ownedSessions = new Map<string, OwnedSession>()
  const cleanupPromises = new Map<string, Promise<void>>()
  let activeSessionId: string | undefined
  const acquisitions = createLatestOperationSupervisor<'acquisition'>(
    'Reader session acquisition',
    { closedError: () => new Error('Reader session owner is closed') },
  )
  const resources = createResourceScope('Reader session owner', { closeMode: 'dependent' })

  const reportCleanupError = (error: unknown): void => {
    try {
      onCleanupError(error)
    }
    catch {
      // Cleanup ownership must not depend on diagnostics succeeding.
    }
  }

  const ownSession = (sessionId: string, requiresFinalFlush: boolean): void => {
    const existing = ownedSessions.get(sessionId)
    ownedSessions.set(sessionId, {
      requiresFinalFlush: requiresFinalFlush || existing?.requiresFinalFlush === true,
    })
  }

  const cleanupOwnedSession = (sessionId: string): Promise<void> => {
    const running = cleanupPromises.get(sessionId)
    if (running)
      return running
    const session = ownedSessions.get(sessionId)
    if (!session)
      return Promise.resolve()

    const cleanup = session.requiresFinalFlush
      ? cleanupReaderSession({ close: () => closeSession(sessionId), flush })
      : closeSession(sessionId).catch((error) => {
          throw new Error(`Failed to close stale reader session ${sessionId}`, { cause: error })
        })
    cleanupPromises.set(sessionId, cleanup)
    void cleanup.then(
      () => {
        if (cleanupPromises.get(sessionId) !== cleanup)
          return
        cleanupPromises.delete(sessionId)
        ownedSessions.delete(sessionId)
        if (activeSessionId === sessionId)
          activeSessionId = undefined
      },
      () => {
        if (cleanupPromises.get(sessionId) === cleanup)
          cleanupPromises.delete(sessionId)
      },
    )
    return cleanup
  }

  const retireAfterReplacement = (sessionId: string): void => {
    const session = ownedSessions.get(sessionId)
    if (session)
      session.requiresFinalFlush = false
    void cleanupOwnedSession(sessionId).catch(reportCleanupError)
  }

  resources.own({ close: acquisitions.close, name: 'reader session acquisitions' })
  resources.own({
    close: () => runLifecycleOperations(
      [...ownedSessions.keys()].map(sessionId => () => cleanupOwnedSession(sessionId)),
      'Reader session owner session cleanup failed',
    ),
    name: 'owned reader sessions',
  })
  resources.commit()

  const acquire = <Result>(
    operation: (signal: AbortSignal) => Promise<Result>,
  ): Promise<ReaderSessionAcquisition<Result>> => {
    if (resources.isClosed())
      return Promise.reject(new Error('Reader session owner is closed'))
    return acquisitions.run('acquisition', async ({ isCurrent, signal }) => {
      const previousSessionId = activeSessionId
      if (previousSessionId !== undefined) {
        await flush()
        signal.throwIfAborted()
        if (!isCurrent())
          throw new Error('Reader session replacement was superseded before acquisition')
      }

      const value = await operation(signal)
      if (!isCurrent())
        return value

      const sessionId = sessionIdOf(value)
      if (sessionId !== undefined) {
        ownSession(sessionId, true)
        activeSessionId = sessionId
        if (previousSessionId !== undefined && previousSessionId !== sessionId)
          retireAfterReplacement(previousSessionId)
      }
      return value
    }, {
      onSuperseded: async (value) => {
        const sessionId = sessionIdOf(value)
        // A stale IPC response can reuse the active native session id. That
        // response does not transfer ownership; closing it would tear down the
        // session that the current request is already using.
        if (sessionId !== undefined && sessionId !== activeSessionId) {
          ownSession(sessionId, false)
          try {
            await cleanupOwnedSession(sessionId)
          }
          catch (error) {
            reportCleanupError(error)
          }
        }
      },
    })
  }

  return { acquire, close: resources.close }
}
