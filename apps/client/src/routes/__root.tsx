import { SidebarInset, SidebarProvider } from '@memorilo/components/ui/sidebar'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { ToastContainer } from 'react-toastify'
import { AppSidebar } from '~/components/app-sidebar'
import { RemoteToast } from '~/components/remote-toast'
import { RootProvider } from '~/provider/root-provider'

export const Route = createRootRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <RootProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <Outlet />
        </SidebarInset>
        <ToastContainer
          position="bottom-right"
          draggable
          pauseOnHover
        />
        <RemoteToast />
      </SidebarProvider>
    </RootProvider>
  )
}
