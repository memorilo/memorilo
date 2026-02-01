import { effectCommands } from '@memorilo/api/command'
import log from '@memorilo/api/log'
import { Skeleton } from '@memorilo/components/ui/skeleton'
import { MemoriloEditor } from '@memorilo/editor'
import { DEV } from '@memorilo/utils/constants'
import { Channel } from '@tauri-apps/api/core'
import { Effect } from 'effect'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify'
import * as Y from 'yjs'

interface EditorProps {
  docId: string
}
export function Editor({ docId }: EditorProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={docId}
        className="size-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12, ease: 'linear' }}
      >
        <EditorInstance docId={docId} key={docId} />
      </motion.div>
    </AnimatePresence>
  )
}

function EditorInstance({ docId }: EditorProps) {
  const { t } = useTranslation()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doc = useMemo(() => new Y.Doc(), [docId])
  const fragment = useMemo(() => doc.getXmlFragment('doc'), [doc])
  const sendSemaphore = useMemo(() => Effect.runSync(Effect.makeSemaphore(1)), [])

  const [initialized, setInitialized] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const initializedRef = useRef(false)

  // Debug only
  // Mount Y.Doc to window for easy access in devtools
  if (DEV) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      const global = window as any
      const id = `doc${docId.replaceAll('-', '_')}`
      if (!global.doc) {
        global.doc = {}
      }
      global.doc[id] = doc
      return () => {
        delete global.doc[id]
      }
    }, [doc, docId])
  }

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
        setSyncError(
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
    if (!initialized || syncError)
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
  }, [docId, doc, initialized, sendSemaphore, syncError, t])

  if (syncError) {
    return (
      <div className="px-2 py-6">
        <p className="text-sm text-destructive">{syncError}</p>
      </div>
    )
  }

  if (!initialized) {
    return (
      <div className="px-2 py-6 space-y-2.5">
        <Skeleton className="w-full h-4" />
        <Skeleton className="w-full h-4" />
        <Skeleton className="w-1/2 h-4" />
        <Skeleton className="w-1/4 h-4" />
      </div>
    )
  }

  return (
    <MemoriloEditor fragment={fragment} />
  )
}
