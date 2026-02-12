import { Button } from '@memorilo/components/ui/button'
import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router'
import { LuArrowLeft, LuArrowRight } from 'react-icons/lu'

export const Route = createFileRoute('/note')({
  component: RouteComponent,
})

function RouteComponent() {
  const router = useRouter()

  const canGoBack = router.history.canGoBack()

  return (
    <div className="size-full flex flex-col overflow-hidden">
      <div className="border-b">
        <Button
          variant="ghost"
          size="icon"
          disabled={!canGoBack}
          onClick={() => router.history.back()}
        >
          <LuArrowLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.history.forward()}
        >
          <LuArrowRight />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
