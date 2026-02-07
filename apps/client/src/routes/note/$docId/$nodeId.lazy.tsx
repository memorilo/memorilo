import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { DocTitleInput } from '~/components/doc-title-input'
import { Editor } from '~/components/editor'

export const Route = createLazyFileRoute('/note/$docId/$nodeId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { docId, nodeId } = Route.useParams()

  const navigate = useNavigate()
  const handleFocusNode = useCallback((uuid: string) => {
    navigate({
      to: '/note/$docId/$nodeId',
      params: { docId, nodeId: uuid },
    })
  }, [navigate, docId])

  return (
    <div className="size-full flex flex-col">
      <DocTitleInput docId={docId} readOnly />
      <div className="min-h-0 flex-1">
        <Editor docId={docId} focusNodeId={nodeId} onOutlineClick={handleFocusNode} />
      </div>
    </div>
  )
}
