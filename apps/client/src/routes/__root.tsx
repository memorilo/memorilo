import { SidebarInset, SidebarProvider } from '@memorilo/components/ui/sidebar'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { AppSidebar } from '~/components/app-sidebar'
import { DebugInfo } from '~/components/debug-info'
import { I18nProvider } from '~/provider/i18n-provider'
import { SettingSync } from '~/provider/settings-sync'

export const Route = createRootRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <DebugInfo scan={false} query={false} router={false}>
      <I18nProvider>
        <SettingSync />
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
      </I18nProvider>
    </DebugInfo>
  )
}
