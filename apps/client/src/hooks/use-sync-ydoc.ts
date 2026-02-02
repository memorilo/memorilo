import { effectCommands } from '@memorilo/api/command'
import log from '@memorilo/api/log'
import { DEV } from '@memorilo/utils/constants'
import { Channel } from '@tauri-apps/api/core'
import { Effect } from 'effect'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import * as Y from 'yjs'

export function useSyncYDoc(docId: string) {
  const { t } = useTranslation()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doc = useMemo(() => new Y.Doc(), [docId])
  const sendSemaphore = useMemo(() => Effect.runSync(Effect.makeSemaphore(1)), [])
  const [initialized, setInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initializedRef = useRef(false)

  const value = useMemo(() => ({
    doc,
    initialized,
    error,
  }), [doc, initialized, error])

  // Watch for document updates from backend
  useEffect(() => {
    initializedRef.current = false

    const markInitialized = (bytes: number) =>
      Effect.sync(() => {
        if (!initializedRef.current) {
          setInitialized(true)
          initializedRef.current = true
          if (DEV) {
            toast.success(`Document loaded, length ${bytes} bytes`, { toastId: `doc-loaded-${docId}` })
          }
        }
      })

    const markError = (error: unknown) =>
      Effect.sync(() => {
        log.error('Failed to apply remote update', error)
        setError(
          t('editor.fail_receive_update', {
            ns: 'errors',
          }),
        )
      })

    const logRetryError = (attempt: number, error: unknown) =>
      Effect.sync(() => {
        log.error(`Failed to apply remote update (attempt ${attempt})`, error)
      })

    const applyUpdateOnce = (diff: Uint8Array, bytes: number) =>
      Effect.try({
        try: () => {
          Y.applyUpdate(doc, diff, 'remote')
          return bytes
        },
        catch: error => error,
      })

    const applyUpdateWithRetry = (
      diff: Uint8Array,
      bytes: number,
      attempt = 1,
      maxAttempts = 3,
    ): Effect.Effect<number, unknown> =>
      applyUpdateOnce(diff, bytes).pipe(
        Effect.tapError(error => logRetryError(attempt, error)),
        Effect.catchAll((error) => {
          if (attempt < maxAttempts) {
            return applyUpdateWithRetry(diff, bytes, attempt + 1, maxAttempts)
          }
          return Effect.fail(error)
        }),
      )

    const channel = new Channel<number[]>((response) => {
      Effect.runPromise(
        Effect.sync(() => {
          const update = new Uint8Array(response)
          const stateVector = Y.encodeStateVector(doc)
          const diff = Y.diffUpdate(update, stateVector)
          return { diff, bytes: response.length }
        }).pipe(
          Effect.flatMap(({ diff, bytes }) =>
            diff.length === 0
              ? markInitialized(bytes)
              : applyUpdateWithRetry(diff, bytes).pipe(
                  Effect.tap(markInitialized),
                  Effect.catchAll(markError),
                ),
          ),
        ),
      )
    })
    const unwatch = Effect.runPromise(effectCommands.watchDoc(docId, channel))

    return () => {
      unwatch.then((watchID) => {
        Effect.runPromise(effectCommands.unwatchDoc(watchID))
      })
      setInitialized(false)
      initializedRef.current = false
    }
  }, [doc, docId, t])

  // Send local document updates to backend
  useEffect(() => {
    // Disable initialization if not initialized
    if (!initialized || error)
      return

    const onUpdate = (_update: Uint8Array, origin: string) => {
      if (origin === 'remote' || !initializedRef.current) {
        return
      }
      Effect.runPromise(
        sendSemaphore.withPermits(1)(
          effectCommands.getDocVersion(docId).pipe(
            Effect.flatMap((stateVector) => {
              const encodedStateVector = new Uint8Array(stateVector)
              const diff = Y.encodeStateAsUpdate(doc, encodedStateVector)
              if (diff.length === 0) {
                return Effect.succeed(undefined)
              }
              // Use topic-specific update to trigger debounced doc_nodes sync on the backend.
              return effectCommands.updateTopicDoc(docId, [...diff])
            }),
            Effect.catchAll((error) => {
              log.error('Failed to send document update', error)
              return Effect.succeed(undefined)
            }),
          ),
        ),
      )
    }
    doc.on('update', onUpdate)

    return () => {
      doc.off('update', onUpdate)
    }
  }, [docId, doc, initialized, sendSemaphore, error, t])

  return value
}
