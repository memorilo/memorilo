import type { NoteSaveRequest, NoteSaveResult } from '@memorilo/desktop-preload/note-save-handshake'
import { randomUUID } from 'node:crypto'
import { noteSaveRequestChannel, noteSaveResultChannel } from '@memorilo/desktop-preload/note-save-handshake'
import { combineLifecycleFailures, toError } from '@memorilo/effect-lifecycle'
import { Deferred, Effect } from 'effect'

export type RendererNoteSaveOutcome = {
  status: 'saved'
} | {
  message: string
  status: 'failed'
} | {
  pendingRendererIds: readonly number[]
  status: 'timed-out'
}

export interface NoteSaveIpcMain {
  off: (channel: string, listener: (event: Electron.IpcMainEvent, result: NoteSaveResult) => void) => unknown
  on: (channel: string, listener: (event: Electron.IpcMainEvent, result: NoteSaveResult) => void) => unknown
}

export interface RendererNoteSaveTarget {
  id: number
  isDestroyed: () => boolean
  once: (event: 'destroyed', listener: () => void) => unknown
  removeListener: (event: 'destroyed', listener: () => void) => unknown
  send: (channel: string, message: NoteSaveRequest) => unknown
}

export interface FlushRendererNotesOptions {
  ipcMain: NoteSaveIpcMain
  targets: readonly RendererNoteSaveTarget[]
  timeoutMs?: number
}

function withCleanupFailures(
  outcome: RendererNoteSaveOutcome,
  cleanupFailures: readonly unknown[],
): RendererNoteSaveOutcome {
  if (cleanupFailures.length === 0)
    return outcome

  const failures = outcome.status === 'saved'
    ? cleanupFailures
    : [
        new Error(outcome.status === 'failed' ? outcome.message : 'Renderer Note save timed out'),
        ...cleanupFailures,
      ]
  return {
    message: toError(combineLifecycleFailures(failures, 'Renderer Note save handshake cleanup failed')).message,
    status: 'failed',
  }
}

export async function flushRendererNotes({
  ipcMain,
  targets,
  timeoutMs = 5_000,
}: FlushRendererNotesOptions): Promise<RendererNoteSaveOutcome> {
  const liveTargets = targets.filter(target => !target.isDestroyed())
  if (liveTargets.length === 0)
    return { status: 'saved' }

  const requestId = randomUUID()
  const pending = new Set(liveTargets.map(target => target.id))
  const cleanupFailures: unknown[] = []

  const handshake = Effect.scoped(Effect.gen(function* () {
    const completion = yield* Deferred.make<RendererNoteSaveOutcome>()
    const complete = (outcome: RendererNoteSaveOutcome): void => {
      Deferred.doneUnsafe(completion, Effect.succeed(outcome))
    }
    const handleResult = (event: Electron.IpcMainEvent, result: NoteSaveResult): void => {
      if (result.requestId !== requestId || !pending.has(event.sender.id))
        return
      if (result.status === 'failed') {
        complete({ message: result.message, status: 'failed' })
        return
      }
      pending.delete(event.sender.id)
      if (pending.size === 0)
        complete({ status: 'saved' })
    }

    yield* Effect.acquireRelease(
      Effect.try({
        catch: toError,
        try: () => ipcMain.on(noteSaveResultChannel, handleResult),
      }),
      () => Effect.sync(() => {
        try {
          ipcMain.off(noteSaveResultChannel, handleResult)
        }
        catch (error) {
          cleanupFailures.push(error)
        }
      }),
    )

    for (const target of liveTargets) {
      const destroyed = () => complete({
        message: `Renderer ${target.id} closed before confirming its Note save`,
        status: 'failed',
      })
      yield* Effect.acquireRelease(
        Effect.try({
          catch: toError,
          try: () => target.once('destroyed', destroyed),
        }),
        () => Effect.sync(() => {
          try {
            target.removeListener('destroyed', destroyed)
          }
          catch (error) {
            cleanupFailures.push(error)
          }
        }),
      )
      if (target.isDestroyed())
        destroyed()
    }

    for (const target of liveTargets) {
      if (Deferred.isDoneUnsafe(completion))
        break
      yield* Effect.try({
        catch: toError,
        try: () => target.send(noteSaveRequestChannel, { requestId }),
      })
    }

    return yield* Deferred.await(completion).pipe(Effect.timeoutOrElse({
      duration: timeoutMs,
      onTimeout: () => Effect.succeed({
        pendingRendererIds: [...pending],
        status: 'timed-out',
      } as const),
    }))
  })).pipe(
    Effect.catchEager(error => Effect.succeed({
      message: toError(error).message,
      status: 'failed',
    } as const)),
  )

  const outcome = await Effect.runPromise(handshake)
  return withCleanupFailures(outcome, cleanupFailures)
}
