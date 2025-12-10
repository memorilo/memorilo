import { SidebarInset, SidebarProvider } from '@memorilo/components/ui/sidebar'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { AppSidebar } from '~/components/app-sidebar'
import { DebugInfo } from '~/components/debug-info'
import { SettingSync } from '~/provider/settings-sync'

export const Route = createRootRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <DebugInfo scan={false} query={false} router={false}>
      <SettingSync />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </DebugInfo>
  )
}
