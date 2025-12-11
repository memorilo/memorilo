import { SidebarInset, SidebarProvider } from '@memorilo/components/ui/sidebar'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { AppSidebar } from '~/components/app-sidebar'
import { RootProvider } from '~/provider/root-provider'

export const Route = createRootRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <RootProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </RootProvider>
  )
}
