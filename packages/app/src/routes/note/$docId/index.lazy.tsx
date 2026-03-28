import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { DocTitleInput } from '~/components/doc-title-input'
import { Editor } from '~/components/editor'

export const Route = createLazyFileRoute('/note/$docId/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { docId } = Route.useParams()
  const navigate = useNavigate()
  const handleFocusNode = useCallback((id: string) => {
    navigate({
      to: '/note/$docId/$nodeId',
      params: { docId, nodeId: id },
    })
  }, [docId, navigate])

  return (
    <div className="size-full flex flex-col">
      <DocTitleInput docId={docId} />
      <div className="min-h-0 flex-1">
        <Editor docId={docId} onOutlineClick={handleFocusNode} />
      </div>
    </div>
  )
}
