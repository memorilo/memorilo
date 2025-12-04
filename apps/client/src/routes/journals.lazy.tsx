import { MemoriloEditor } from '@memorilo/editor'
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/journals')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-col">
      <h2 className="font-bold text-center">Temparory Page, debug only</h2>
      <div className="border flex-1 min-h-0">
        <MemoriloEditor className="size-full" />
      </div>
    </div>
  )
}
