import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/journals')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex h-full flex-col">
    </div>
  )
}
