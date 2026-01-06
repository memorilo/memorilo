import type { LoroDocType } from '@memorilo/editor'
import { MemoriloEditor } from '@memorilo/editor'
import { createLazyFileRoute } from '@tanstack/react-router'
import { LoroDoc } from 'loro-crdt'
import { useMemo } from 'react'

export const Route = createLazyFileRoute('/journals')({
  component: RouteComponent,
})

function RouteComponent() {
  // Temporarily using a new doc for debugging
  const loroDoc = useMemo(() => new LoroDoc() as LoroDocType, [])

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
