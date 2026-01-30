import type { LoroDocType } from '@memorilo/editor'
import { effectCommands } from '@memorilo/api/command'
import { Skeleton } from '@memorilo/components/ui/skeleton'
import { MemoriloEditor } from '@memorilo/editor'
import { DEV } from '@memorilo/utils/constants'
import { Channel } from '@tauri-apps/api/core'
import { Effect, Option } from 'effect'
import { LoroDoc, VersionVector } from 'loro-crdt'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'

interface EditorProps {
  docId: string
}

export function Editor({ docId }: EditorProps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doc = useMemo(() => new LoroDoc(), [docId])

  const [initialized, setInitialized] = useState(false)
  const initializedRef = useRef(false)

  // Debug only
  // Mount LoroDoc to window for easy access in devtools
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
    let delayID = Option.none<number>()
    const channel = new Channel<number[]>((response) => {
      doc.import(new Uint8Array(response))
      if (!initializedRef.current) {
        delayID = Option.some(requestAnimationFrame(() => {
          setInitialized(true)
          initializedRef.current = true
        }))
        if (DEV) {
          toast.success(`Document loaded, length ${response.length} bytes`, { toastId: `doc-loaded-${docId}` })
        }
      }
    })
    const unwatch = Effect.runPromise(effectCommands.watchDoc(docId, channel))

    return () => {
      unwatch.then((watchID) => {
        Effect.runPromise(effectCommands.unwatchDoc(watchID))
      })
      setInitialized(false)
      initializedRef.current = false
      delayID.pipe(Option.map(id => cancelAnimationFrame(id)))
    }
  }, [doc, docId])

  // Send local document updates to backend
  useEffect(() => {
    // Disable initialization if not initialized
    if (!initialized)
      return

    const unsubscribe = doc.subscribe((update) => {
      if (update.by !== 'local' || !initializedRef.current) {
        return
      }
      // Use topic-specific update to trigger debounced doc_nodes sync on the backend.
      Effect.runPromise(Effect.gen(function* () {
        const version = yield* effectCommands.getDocVersion(docId)
        const vvmap = new Map([...Object.entries(version)])
        const vv = VersionVector.parseJSON(vvmap as any)
        const bytes = doc.export({ mode: 'update', from: vv })
        yield* effectCommands.updateTopicDoc(docId, [...bytes])
      }))
    })

    return () => {
      unsubscribe()
    }
  }, [docId, doc, initialized])

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
    <MemoriloEditor
      key={docId}
      doc={doc as LoroDocType}
    />
  )
}
