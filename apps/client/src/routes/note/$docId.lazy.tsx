import { createLazyFileRoute } from '@tanstack/react-router'
import { Editor } from '~/components/editor'

export const Route = createLazyFileRoute('/note/$docId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { docId } = Route.useParams()

  return (
    <div className="size-full">
      <Editor docId={docId} />
    </div>
  )
}
