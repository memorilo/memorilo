import type { LoroDocType } from '@memorilo/editor'
import { MemoriloEditor } from '@memorilo/editor'
import { DEV } from '@memorilo/utils/constants'
import { createLazyFileRoute } from '@tanstack/react-router'
import { LoroDoc } from 'loro-crdt'
import { useMemo } from 'react'

export const Route = createLazyFileRoute('/journals')({
  component: RouteComponent,
})

function RouteComponent() {
  // Temporarily using a new doc for debugging
  const loroDoc = useMemo(() => {
    const doc = new LoroDoc() as LoroDocType

    // TODO: remove this after completing editor feature
    if (DEV) {
      try {
        if (localStorage.getItem('memorilo:debug-journal-cache')) {
          doc.importJsonUpdates(localStorage.getItem('memorilo:debug-journal-cache')!)
        }
      }
      catch {}
      doc.subscribe(() => {
        const updates = doc.exportJsonUpdates()
        localStorage.setItem('memorilo:debug-journal-cache', JSON.stringify(updates))
      })
    }

    return doc
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-2">
        <h2 className="font-bold">Journal (Debug)</h2>
      </div>
      <div className="flex-1 min-h-0 border">
        <MemoriloEditor className="size-full" doc={loroDoc} />
      </div>
    </div>
  )
}
