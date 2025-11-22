import { SidebarInset, SidebarProvider } from '@memorilo/components/ui/sidebar'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { AppSidebar } from '~/components/app-sidebar'

export const Route = createRootRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}
