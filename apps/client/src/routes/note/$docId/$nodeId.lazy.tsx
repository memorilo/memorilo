import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { Editor } from '~/components/editor'
import { useTitle } from '~/hooks/use-title'

export const Route = createLazyFileRoute('/note/$docId/$nodeId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { docId, nodeId } = Route.useParams()

  useTitle(`Document: ${docId} - Node: ${nodeId}`)

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
