import type { LoroDocType } from '@memorilo/editor'
import { effectCommands } from '@memorilo/api/command'
import { MemoriloEditor } from '@memorilo/editor'
import { createLazyFileRoute } from '@tanstack/react-router'
import { Channel } from '@tauri-apps/api/core'
import { Effect } from 'effect'
import { LoroDoc, VersionVector } from 'loro-crdt'
import { useEffect, useMemo } from 'react'

export const Route = createLazyFileRoute('/note/$docId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { docId } = Route.useParams()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doc = useMemo(() => new LoroDoc(), [docId])
  useEffect(() => {
    const channel = new Channel<number[]>((response) => {
      doc.import(new Uint8Array(response))
    })
    const unwatch = Effect.runPromise(effectCommands.watchDoc(docId, channel))

    const unsubscribe = doc.subscribe((update) => {
      if (update.by !== 'local') {
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
      unwatch.then((watchID) => {
        Effect.runPromise(effectCommands.unwatchDoc(watchID))
      })
    }
  }, [docId, doc])

  return (
    <div>
      <MemoriloEditor doc={doc as LoroDocType} />
    </div>
  )
}
