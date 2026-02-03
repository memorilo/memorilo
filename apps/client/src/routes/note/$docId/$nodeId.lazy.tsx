import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
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
    <div className="size-full">
      <Editor docId={docId} focusNodeId={nodeId} onOutlineClick={handleFocusNode} />
    </div>
  )
}
