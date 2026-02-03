import { createLazyFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { Editor } from '~/components/editor'
import { useTitle } from '~/hooks/use-title'

export const Route = createLazyFileRoute('/note/$docId/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { docId } = Route.useParams()

  useTitle(`Document: ${docId}`)

  const navigate = useNavigate()
  const handleFocusNode = useCallback((uuid: string) => {
    navigate({
      to: '/note/$docId/$nodeId',
      params: { docId, nodeId: uuid },
    })
  }, [navigate, docId])
  return (
    <div className="size-full">
      <Editor docId={docId} onOutlineClick={handleFocusNode} />
    </div>
  )
}
